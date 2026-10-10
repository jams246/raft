import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Failure } from '../../shared/failures.js'
import { elementAt } from '../../shared/collections.js'
import type { ConflictPolicy, MultipartFile, StoredUploadPart, UploadStagingPort } from '../Application/ports.js'
import type { ResolvedPath, UploadConflict } from '../Domain/models.js'
import type { UploadManifest } from '../Domain/upload-policy.js'
import { PathResolver } from './path-resolver.js'
import { getConflicts, promotePreparedReplacement, resolveReplacementTargets, unusedInternalPath, validateIncomingNames } from './prepared-replacement.js'
import { isMissing, toFilesystemFailure, withFilesystemFailure } from './filesystem-failures.js'
import { UploadPartStorage } from './upload-part-storage.js'
import type { CapacityPort } from '../Application/ports.js'

export class UploadStagingAdapter implements UploadStagingPort {
  constructor(
    private readonly paths: PathResolver,
    private readonly capacity: CapacityPort,
    private readonly parts: UploadPartStorage
  ) {}

  async validateDestination(virtualPath: string): Promise<ResolvedPath> {
    const destination = await this.paths.resolve(virtualPath)
    if (!destination.isDirectory) throw new Failure('invalid_path', 'The requested upload directory is invalid.')
    return destination
  }

  async prepare(destination: ResolvedPath, operationId: string, bytesTotal: number): Promise<string> {
    await this.capacity.assertAvailable(destination.absolutePath, BigInt(bytesTotal))
    const stagingPath = join(destination.absolutePath, `.__filebrowser_tmp_${operationId}_0`)
    try {
      await mkdir(stagingPath)
      return stagingPath
    } catch (error) {
      throw toFilesystemFailure(error)
    }
  }

  async preflight(destination: ResolvedPath, manifest: UploadManifest): Promise<UploadConflict[]> {
    if (manifest.items.length === 0) throw invalidUpload()
    const probePath = await this.prepareProbe(destination.absolutePath)
    try {
      await validateIncomingNames(probePath, manifest.items)
    } catch (error) {
      await this.cleanupAfterProbe(probePath, error)
      throw toFilesystemFailure(error)
    }
    await this.cleanupAfterProbe(probePath)
    return getConflicts(destination.absolutePath, manifest.items)
  }

  storePart(
    stagingPath: string,
    bytesTotal: number,
    signal: AbortSignal,
    file: MultipartFile,
    _currentName: string,
    report: (bytes: number) => void
  ): Promise<StoredUploadPart> {
    return this.parts.store(stagingPath, bytesTotal, signal, file, report)
  }

  removePart(stagingPath: string, path: string): Promise<void> {
    return this.parts.remove(stagingPath, path)
  }

  async finish(
    stagingPath: string,
    destination: ResolvedPath,
    operationId: string,
    manifest: UploadManifest,
    parts: StoredUploadPart[],
    policy: ConflictPolicy,
    signal: AbortSignal,
    onCompleted: (index: number, name: string) => void
  ): Promise<void> {
    await validateIncomingNames(stagingPath, manifest.items)
    const incomingPaths = await this.prepareIncomingObjects(stagingPath, manifest, parts, signal).catch((error: unknown) => {
      throw toFilesystemFailure(error)
    })
    const targets = await resolveReplacementTargets(destination.absolutePath, manifest.items, policy)
    const preparedPaths: string[] = []
    let completedItems = 0
    let failed = false
    let failure: unknown
    try {
      await stageIncomingPaths(incomingPaths, preparedPaths, destination.absolutePath, operationId, signal)
      for (const [index, target] of targets.entries()) {
        signal.throwIfAborted()
        const cleanupFailure = await promotePreparedReplacement(elementAt(preparedPaths, index), target, operationId, index)
        completedItems += 1
        onCompleted(index, elementAt(manifest.items, index).name)
        if (cleanupFailure) throw cleanupFailure
      }
      signal.throwIfAborted()
    } catch (error) {
      failed = true
      failure = completedItems > 0 ? withFilesystemFailure(error, `The upload stopped after ${completedItems} of ${manifest.items.length} items.`) : error
    }

    await cleanupPreparedUploads(preparedPaths, failed, failure)
  }

  async cleanup(stagingPath: string): Promise<void> {
    try {
      await rm(stagingPath, { recursive: true, force: true })
    } catch (error) {
      if (!isMissing(error)) throw toFilesystemFailure(error)
    } finally {
      this.parts.clear(stagingPath)
    }
  }

  private async prepareIncomingObjects(stagingPath: string, manifest: UploadManifest, storedParts: StoredUploadPart[], signal: AbortSignal): Promise<string[]> {
    const parts = indexStoredParts(stagingPath, storedParts)

    const incomingPaths: string[] = []
    for (const [itemIndex, item] of manifest.items.entries()) {
      signal.throwIfAborted()
      const objectPath = join(stagingPath, `object-${itemIndex}`)
      if (item.type === 'file') {
        const [file] = item.files
        const sourcePath = file === undefined ? undefined : parts.get(file.part)
        if (sourcePath === undefined) throw invalidUpload()
        await rename(sourcePath, objectPath)
      } else {
        await mkdir(objectPath)
        for (const file of item.files) {
          signal.throwIfAborted()
          const sourcePath = parts.get(file.part)
          if (!sourcePath) throw invalidUpload()
          const targetPath = join(objectPath, ...file.path.split('/'))
          await mkdir(dirname(targetPath), { recursive: true })
          await rename(sourcePath, targetPath)
        }
      }
      incomingPaths.push(objectPath)
    }
    return incomingPaths
  }

  private async prepareProbe(destinationPath: string): Promise<string> {
    const probePath = join(destinationPath, `.__filebrowser_tmp_${randomUUID()}_0`)
    try {
      await mkdir(probePath)
      return probePath
    } catch (error) {
      throw toFilesystemFailure(error)
    }
  }

  private async cleanupAfterProbe(probePath: string, primaryFailure?: unknown): Promise<void> {
    try {
      await this.cleanup(probePath)
    } catch (cleanupError) {
      if (primaryFailure !== undefined) throw withFilesystemFailure(primaryFailure, 'Temporary upload data could not be removed.', cleanupError)
      throw withFilesystemFailure(cleanupError, 'Temporary upload data could not be removed.')
    }
  }
}

function invalidUpload(): Failure {
  return new Failure('invalid_request', 'The upload request is invalid.')
}

function indexStoredParts(stagingPath: string, storedParts: StoredUploadPart[]): Map<number, string> {
  const parts = new Map<number, string>()
  for (const part of storedParts) {
    const match = /^file(\d+)$/.exec(part.fieldname)
    const index = match ? Number(match[1]) : -1
    if (!Number.isSafeInteger(index) || index < 0 || index >= storedParts.length || parts.has(index) || dirname(part.path) !== stagingPath)
      throw invalidUpload()
    parts.set(index, part.path)
  }
  if (parts.size !== storedParts.length) throw invalidUpload()

  return parts
}

async function cleanupPreparedUploads(preparedPaths: string[], failed: boolean, failure: unknown): Promise<void> {
  const cleanupResults = await Promise.allSettled(preparedPaths.map((path) => rm(path, { recursive: true, force: true })))
  const cleanupError = cleanupResults.find((result) => result.status === 'rejected' && !isMissing(result.reason))
  if (cleanupError?.status === 'rejected') {
    failure = failed
      ? withFilesystemFailure(failure, 'Temporary upload data could not be removed.', cleanupError.reason)
      : withFilesystemFailure(cleanupError.reason, 'Temporary upload data could not be removed.')
    failed = true
  }
  if (failed) throw toFilesystemFailure(failure)
}

async function stageIncomingPaths(
  incomingPaths: string[],
  preparedPaths: string[],
  destinationPath: string,
  operationId: string,
  signal: AbortSignal
): Promise<void> {
  for (const [index, incomingPath] of incomingPaths.entries()) {
    signal.throwIfAborted()
    const preparedPath = await unusedInternalPath(destinationPath, 'tmp', operationId, index + 1)
    await rename(incomingPath, preparedPath)
    preparedPaths.push(preparedPath)
  }
}
