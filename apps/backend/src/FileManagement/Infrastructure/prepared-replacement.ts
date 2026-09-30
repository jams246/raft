import { randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Failure } from '../../shared/failures.js'
import type { ReplacementCandidate, UploadConflict } from '../Domain/models.js'
import type { UploadManifestItem } from '../Domain/upload-policy.js'
import { conflictName, firstConflictCounter } from '../Domain/conflict-name-policy.js'
import { isMissing, toFilesystemFailure, withFilesystemFailure } from './filesystem-failures.js'
import { PathResolver } from './path-resolver.js'

export interface PreparedDestination {
  name: string
  path: string
  existing: boolean
}

export async function getConflicts(destinationPath: string, items: ReplacementCandidate[]): Promise<UploadConflict[]> {
  const targets = await resolveReplacementTargets(destinationPath, items, 'rename')
  return targets.flatMap((target, index) => (target.name === items[index].name ? [] : [{ name: items[index].name, suggestedName: target.name }]))
}

export async function validateIncomingNames(stagingPath: string, items: UploadManifestItem[]): Promise<void> {
  const claimsPath = join(stagingPath, 'claims')
  await mkdir(claimsPath).catch((error: unknown) => {
    throw toFilesystemFailure(error)
  })
  await withTemporaryDirectory(claimsPath, async () => {
    for (const item of items) {
      const itemPath = join(claimsPath, item.name)
      await createClaimDirectory(claimsPath, item.name)
      if (item.type !== 'directory') continue
      for (const file of item.files) {
        const components = file.path.split('/')
        let parentPath = itemPath
        for (const component of components.slice(0, -1)) {
          await createClaimDirectory(parentPath, component)
          parentPath = join(parentPath, component)
        }
        try {
          const handle = await open(join(parentPath, components.at(-1) as string), 'wx')
          await handle.close()
        } catch (error) {
          if (isExists(error)) throw new Failure('invalid_request', 'Selected files have names that collide on this filesystem.')
          throw toFilesystemFailure(error)
        }
      }
    }
  })
}

export async function resolveReplacementTargets(
  destinationPath: string,
  items: ReplacementCandidate[],
  policy: 'rename' | 'overwrite'
): Promise<PreparedDestination[]> {
  const claimsPath = await unusedInternalPath(destinationPath, 'tmp', randomUUID(), 0)
  await mkdir(claimsPath).catch((error: unknown) => {
    throw toFilesystemFailure(error)
  })
  return withTemporaryDirectory(claimsPath, async () => {
    const targets: PreparedDestination[] = []
    for (const item of items) await mkdir(join(claimsPath, item.name))
    for (const item of items) {
      let name = item.name
      let targetPath = join(destinationPath, name)
      let existing = await pathExists(targetPath)
      if (policy === 'rename' && existing) {
        name = await findAvailableName(destinationPath, item, claimsPath)
        await mkdir(join(claimsPath, name))
        targetPath = join(destinationPath, name)
        existing = false
      }
      if (existing && policy === 'overwrite') await validateReplacementTarget(targetPath)
      targets.push({ name, path: targetPath, existing })
    }
    return targets
  })
}

export async function promotePreparedReplacement(
  preparedPath: string,
  target: PreparedDestination,
  operationId: string,
  index: number
): Promise<Failure | undefined> {
  let backupPath: string | undefined
  if (target.existing) {
    backupPath = await unusedInternalPath(dirname(target.path), 'old', operationId, index)
    await rename(target.path, backupPath)
  }

  try {
    await rename(preparedPath, target.path)
  } catch (error) {
    if (backupPath) {
      try {
        if (await pathExists(target.path)) throw new Error('The destination path is occupied.')
        await rename(backupPath, target.path)
      } catch (restoreError) {
        throw withFilesystemFailure(
          error,
          'The replacement failed and the original item could not be restored. A backup was retained for manual recovery.',
          restoreError
        )
      }
    }
    throw toFilesystemFailure(error)
  }

  if (!backupPath) return
  try {
    await rm(backupPath, { recursive: true })
  } catch (error) {
    return withFilesystemFailure(error, 'The replacement completed, but its backup could not be removed. Check for recovery data in the destination.')
  }
}

export async function unusedInternalPath(parentPath: string, kind: 'tmp' | 'old', operationId: string, counter: number): Promise<string> {
  let nextCounter = counter
  while (true) {
    const candidate = join(parentPath, `.__filebrowser_${kind}_${operationId}_${nextCounter}`)
    if (!(await pathExists(candidate))) return candidate
    nextCounter += 1
  }
}

async function findAvailableName(destinationPath: string, item: ReplacementCandidate, claimsPath: string): Promise<string> {
  for (let counter = firstConflictCounter(item.name, item.type); ; counter += 1n) {
    const candidate = conflictName(item.name, item.type, counter)
    if (!(await pathExists(join(claimsPath, candidate))) && !(await pathExists(join(destinationPath, candidate)))) return candidate
  }
}

async function validateReplacementTarget(targetPath: string): Promise<void> {
  let metadata
  try {
    metadata = await lstat(targetPath)
  } catch (error) {
    if (isMissing(error)) return
    throw toFilesystemFailure(error)
  }
  if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile())) {
    throw new Failure('unsupported', 'The requested path is unsupported.')
  }
  if (metadata.isDirectory()) {
    try {
      await new PathResolver().validateSupportedTree({ virtualPath: targetPath, absolutePath: targetPath, isDirectory: true })
    } catch (error) {
      throw toFilesystemFailure(error)
    }
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (isMissing(error)) return false
    throw toFilesystemFailure(error)
  }
}

async function createClaimDirectory(parentPath: string, name: string): Promise<void> {
  try {
    await mkdir(join(parentPath, name))
  } catch (error) {
    if (!isExists(error)) throw toFilesystemFailure(error)
    const entries = await readdir(parentPath, { withFileTypes: true })
    if (entries.some((entry) => entry.name === name && entry.isDirectory())) return
    throw new Failure('invalid_request', 'Selected items have names that collide on this filesystem.')
  }
}

function isExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'
}

async function withTemporaryDirectory<T>(directory: string, action: () => Promise<T>): Promise<T> {
  let result!: T
  let failure: unknown
  let didFail = false
  try {
    result = await action()
  } catch (error) {
    failure = error
    didFail = true
  }

  try {
    await rm(directory, { recursive: true, force: true })
  } catch (cleanupError) {
    if (!isMissing(cleanupError)) {
      if (didFail) throw withFilesystemFailure(failure, 'Temporary validation data could not be removed.', cleanupError)
      throw withFilesystemFailure(cleanupError, 'Temporary validation data could not be removed.')
    }
  }
  if (didFail) throw toFilesystemFailure(failure)
  return result
}
