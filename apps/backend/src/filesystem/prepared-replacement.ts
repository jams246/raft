import { HttpStatus } from '@nestjs/common'
import type { UploadConflict, UploadConflictPolicy } from '@raft/shared'
import { lstat, mkdir, open, readdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ApiException } from '../api/api-exception.js'
import { toFilesystemException } from './errors.js'
import { validateSupportedTree } from './paths.js'

export interface PreparedDestination {
  name: string
  path: string
  existing: boolean
}

export async function getUploadConflicts(destinationPath: string, items: UploadCandidate[]): Promise<UploadConflict[]> {
  const targets = await resolveUploadTargets(destinationPath, items, 'rename')
  return targets.flatMap((target, index) => (target.name === items[index].name ? [] : [{ name: items[index].name, suggestedName: target.name }]))
}

export async function validateIncomingNames(stagingPath: string, items: UploadCandidate[]): Promise<void> {
  const claimsPath = join(stagingPath, 'claims')
  await mkdir(claimsPath)
  try {
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
          if (isExists(error)) throw new ApiException('invalid_request', 'Selected files have names that collide on this filesystem.', HttpStatus.BAD_REQUEST)
          throw toFilesystemException(error)
        }
      }
    }
  } finally {
    await rm(claimsPath, { recursive: true, force: true })
  }
}

export async function resolveUploadTargets(destinationPath: string, items: UploadCandidate[], policy: UploadConflictPolicy): Promise<PreparedDestination[]> {
  const claimsPath = await unusedInternalPath(destinationPath, 'tmp', randomUUID(), 0)
  await mkdir(claimsPath)
  const targets: PreparedDestination[] = []
  try {
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
  } finally {
    await rm(claimsPath, { recursive: true, force: true })
  }
}

export async function promotePreparedReplacement(
  preparedPath: string,
  target: PreparedDestination,
  operationId: string,
  index: number
): Promise<ApiException | undefined> {
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
      } catch {
        throw new ApiException(
          'operation_failed',
          'The replacement failed and the original item could not be restored. A backup was retained for manual recovery.',
          HttpStatus.INTERNAL_SERVER_ERROR
        )
      }
    }
    throw toFilesystemException(error)
  }

  if (!backupPath) return
  try {
    await rm(backupPath, { recursive: true })
  } catch {
    return new ApiException(
      'operation_failed',
      'The replacement completed, but its backup could not be removed. The backup was retained for manual recovery.',
      HttpStatus.INTERNAL_SERVER_ERROR
    )
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

async function findAvailableName(destinationPath: string, item: UploadCandidate, claimsPath: string): Promise<string> {
  const extensionStart = item.type === 'file' ? item.name.lastIndexOf('.') : -1
  const hasExtension = extensionStart > 0
  const fullBaseName = hasExtension ? item.name.slice(0, extensionStart) : item.name
  const counterMatch = /^(.*) \((\d+)\)$/.exec(fullBaseName)
  const baseName = counterMatch?.[1] ?? fullBaseName
  const extension = hasExtension ? item.name.slice(extensionStart) : ''
  for (let counter = counterMatch ? BigInt(counterMatch[2]) + 1n : 1n; ; counter += 1n) {
    const candidate = `${baseName} (${counter})${extension}`
    if (!(await pathExists(join(claimsPath, candidate))) && !(await pathExists(join(destinationPath, candidate)))) return candidate
  }
}

async function validateReplacementTarget(targetPath: string): Promise<void> {
  let metadata
  try {
    metadata = await lstat(targetPath)
  } catch (error) {
    if (isMissing(error)) return
    throw toFilesystemException(error)
  }
  if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile())) {
    throw new ApiException('unsupported', 'The requested path is unsupported.', HttpStatus.BAD_REQUEST)
  }
  if (metadata.isDirectory()) {
    try {
      await validateSupportedTree({ virtualPath: targetPath, absolutePath: targetPath, isDirectory: true })
    } catch (error) {
      throw toFilesystemException(error)
    }
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (isMissing(error)) return false
    throw toFilesystemException(error)
  }
}

async function createClaimDirectory(parentPath: string, name: string): Promise<void> {
  try {
    await mkdir(join(parentPath, name))
  } catch (error) {
    if (!isExists(error)) throw toFilesystemException(error)
    const entries = await readdir(parentPath, { withFileTypes: true })
    if (entries.some((entry) => entry.name === name && entry.isDirectory())) return
    throw new ApiException('invalid_request', 'Selected items have names that collide on this filesystem.', HttpStatus.BAD_REQUEST)
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}

function isExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'
}

export interface UploadCandidate {
  name: string
  type: 'file' | 'directory'
  files: Array<{ path: string }>
}
