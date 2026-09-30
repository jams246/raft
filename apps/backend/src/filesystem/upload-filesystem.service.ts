import { HttpStatus, Injectable } from '@nestjs/common'
import type { UploadConflict, UploadConflictPolicy, UploadManifest } from '@raft/shared'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ApiException } from '../api/api-exception.js'
import { toFilesystemException, withFilesystemFailure } from './errors.js'
import { FilesystemService } from './filesystem.service.js'
import { parseUploadManifest } from './upload-validation.js'
import { resolveVirtualPath } from './paths.js'
import type { ValidatedPath } from './paths.js'
import { getConflicts, promotePreparedReplacement, resolveReplacementTargets, unusedInternalPath, validateIncomingNames } from './prepared-replacement.js'

interface StoredPart {
  fieldname: string
  path: string
}

@Injectable()
export class UploadFilesystemService {
  constructor(private readonly filesystemService: FilesystemService) {}

  async validateDestination(virtualPath: string): Promise<ValidatedPath> {
    if (virtualPath === '/') {
      throw new ApiException('protected_root', 'Uploads cannot target the root.', HttpStatus.BAD_REQUEST)
    }
    const destination = await resolveVirtualPath(virtualPath)
    if (!destination.isDirectory) {
      throw new ApiException('invalid_path', 'The requested upload directory is invalid.', HttpStatus.BAD_REQUEST)
    }
    return destination
  }

  async createStagingDirectory(destinationPath: string, operationId: string): Promise<string> {
    const stagingPath = join(destinationPath, `.__filebrowser_tmp_${operationId}_0`)
    try {
      await mkdir(stagingPath)
      return stagingPath
    } catch (error) {
      throw toFilesystemException(error)
    }
  }

  prepareUpload(virtualPath: string, operationId: string): Promise<string> {
    return this.filesystemService.runTransferMutation(operationId, async () => {
      const destination = await this.validateDestination(virtualPath)
      return this.createStagingDirectory(destination.absolutePath, operationId)
    })
  }

  async preflight(virtualPath: string, manifest: UploadManifest): Promise<UploadConflict[]> {
    const destination = await this.validateDestination(virtualPath)
    if (manifest.items.length === 0) throw invalidUpload()
    const probePath = await this.createStagingDirectory(destination.absolutePath, randomUUID())
    try {
      await validateIncomingNames(probePath, manifest.items)
    } finally {
      await this.cleanupStagingDirectory(probePath)
    }
    return getConflicts(destination.absolutePath, manifest.items)
  }

  async finishUpload(
    operationId: string,
    virtualPath: string,
    stagingPath: string,
    rawManifest: unknown,
    storedParts: StoredPart[],
    policy: UploadConflictPolicy,
    total: number,
    signal: AbortSignal
  ): Promise<void> {
    const manifest = parseUploadManifest(rawManifest, total, storedParts.length)
    if (policy !== 'rename' && policy !== 'overwrite') throw invalidUpload()

    await this.filesystemService.runTransferMutation(operationId, async () => {
      signal.throwIfAborted()
      const destination = await this.validateDestination(virtualPath)
      await validateIncomingNames(stagingPath, manifest.items)
      const incomingPaths = await this.prepareIncomingObjects(stagingPath, manifest, storedParts, signal)
      const targets = await resolveReplacementTargets(destination.absolutePath, manifest.items, policy)
      const preparedPaths: string[] = []
      let completedItems = 0
      try {
        for (const [index, incomingPath] of incomingPaths.entries()) {
          signal.throwIfAborted()
          const preparedPath = await unusedInternalPath(destination.absolutePath, 'tmp', operationId, index + 1)
          await rename(incomingPath, preparedPath)
          preparedPaths.push(preparedPath)
        }

        for (const [index, target] of targets.entries()) {
          signal.throwIfAborted()
          const cleanupFailure = await promotePreparedReplacement(preparedPaths[index], target, operationId, index)
          completedItems += 1
          if (cleanupFailure) throw cleanupFailure
        }
        signal.throwIfAborted()
      } catch (error) {
        if (completedItems > 0) {
          throw withFilesystemFailure(error, `The upload stopped after ${completedItems} of ${manifest.items.length} items.`)
        }
        throw error
      } finally {
        await Promise.all(preparedPaths.map((path) => rm(path, { recursive: true, force: true }).catch(() => undefined)))
      }
    })
  }

  async cleanupStagingDirectory(stagingPath: string): Promise<void> {
    await rm(stagingPath, { recursive: true, force: true }).catch((error: unknown) => {
      if (isMissing(error)) return
      throw toFilesystemException(error)
    })
  }

  private async prepareIncomingObjects(stagingPath: string, manifest: UploadManifest, storedParts: StoredPart[], signal: AbortSignal): Promise<string[]> {
    const parts = new Map<number, string>()
    for (const part of storedParts) {
      const match = /^file(\d+)$/.exec(part.fieldname)
      const index = match ? Number(match[1]) : -1
      if (!Number.isSafeInteger(index) || index < 0 || index >= storedParts.length || parts.has(index) || dirname(part.path) !== stagingPath)
        throw invalidUpload()
      parts.set(index, part.path)
    }
    if (parts.size !== storedParts.length) throw invalidUpload()

    const incomingPaths: string[] = []
    for (const [itemIndex, item] of manifest.items.entries()) {
      signal.throwIfAborted()
      const objectPath = join(stagingPath, `object-${itemIndex}`)
      if (item.type === 'file') {
        const sourcePath = parts.get(item.files[0].part)
        if (!sourcePath) throw invalidUpload()
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
}

function invalidUpload(): ApiException {
  return new ApiException('invalid_request', 'The upload request is invalid.', HttpStatus.BAD_REQUEST)
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}
