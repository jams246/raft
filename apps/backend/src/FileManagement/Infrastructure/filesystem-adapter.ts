import { access, lstat, mkdir, open, readdir, rename, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import type { Readable } from 'node:stream'
import { basename, dirname, join } from 'node:path'
import { Failure } from '../../shared/failures.js'
import type { DirectoryListing, FileEntry, ReplacementCandidate, ResolvedPath } from '../Domain/models.js'
import { INTERNAL_TEMPORARY_NAME } from '../Domain/path-policy.js'
import type { CopyMoveItem, CopyMoveResult } from '../Application/copy-move-models.js'
import type { ConflictPolicy, FileSystemPort, FileTreeEntry } from '../Application/ports.js'
import { PathResolver } from './path-resolver.js'
import { isMissing, toFilesystemFailure, withFilesystemFailure } from './filesystem-failures.js'
import type { CopyMoveStorageAdapter } from './copy-move-storage-adapter.js'
import { getConflicts, resolveReplacementTargets } from './prepared-replacement.js'

export class FilesystemAdapter implements FileSystemPort {
  constructor(
    private readonly paths: PathResolver,
    private readonly copyMove: CopyMoveStorageAdapter
  ) {}

  resolvePath(virtualPath: string): Promise<ResolvedPath> {
    return this.paths.resolve(virtualPath)
  }

  async validateExistingPath(virtualPath: string): Promise<ResolvedPath> {
    const path = await this.paths.resolve(virtualPath)
    if (path.isDirectory) await this.validateSupportedTree(path)
    return path
  }

  async validateDirectory(virtualPath: string): Promise<ResolvedPath> {
    const directory = await this.paths.resolve(virtualPath)
    if (!directory.isDirectory) throw new Failure('invalid_path', 'The requested path is invalid.')
    return directory
  }

  validateSupportedTree(path: ResolvedPath): Promise<void> {
    return this.paths.validateSupportedTree(path)
  }

  async listSupportedTree(path: ResolvedPath): Promise<FileTreeEntry[]> {
    return (await this.paths.listSupportedTree(path)).map((entry) => ({
      absolutePath: entry.absolutePath,
      relativePath: entry.relativePath,
      isDirectory: entry.isDirectory,
      size: entry.stats.size,
      modifiedAt: entry.stats.mtime,
      mode: entry.stats.mode
    }))
  }

  async assertReadable(filePaths: string[]): Promise<void> {
    try {
      await Promise.all(filePaths.map((path) => access(path, constants.R_OK)))
    } catch (error) {
      throw toFilesystemFailure(error)
    }
  }

  async openFileForDownload(path: ResolvedPath): Promise<{ fileName: string; stream: Readable }> {
    const fileHandle = await open(path.absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch((error: unknown) => {
      throw toFilesystemFailure(error)
    })
    try {
      if (!(await fileHandle.stat()).isFile()) throw new Failure('unsupported', 'The requested path is unsupported.')
      return { fileName: basename(path.absolutePath), stream: fileHandle.createReadStream({ autoClose: true }) }
    } catch (error) {
      await fileHandle.close().catch(() => {})
      throw toFilesystemFailure(error)
    }
  }

  async deletePaths(pathsToDelete: ResolvedPath[]): Promise<void> {
    let deletedCount = 0
    for (const path of pathsToDelete) {
      try {
        await rm(path.absolutePath, { recursive: true })
        deletedCount += 1
      } catch (error) {
        throw withFilesystemFailure(
          error,
          `Deletion stopped after deleting ${deletedCount} of ${pathsToDelete.length} selected items. Selected content may also be partially deleted.`
        )
      }
    }
  }

  async createDirectory(parent: ResolvedPath, name: string): Promise<void> {
    try {
      await mkdir(join(parent.absolutePath, name))
    } catch (error) {
      throw toFilesystemFailure(error)
    }
  }

  async renamePath(source: ResolvedPath, name: string): Promise<void> {
    const targetPath = join(dirname(source.absolutePath), name)
    let targetExists = true
    try {
      await lstat(targetPath)
    } catch (error) {
      if (isMissing(error)) targetExists = false
      else throw toFilesystemFailure(error)
    }
    if (targetExists) throw new Failure('conflict', 'An item with that name already exists.')
    try {
      await rename(source.absolutePath, targetPath)
    } catch (error) {
      throw toFilesystemFailure(error)
    }
  }

  async listDirectory(directory: ResolvedPath): Promise<DirectoryListing> {
    const virtualPath = directory.virtualPath
    const names = (
      await readdir(directory.absolutePath).catch((error: unknown) => {
        throw toFilesystemFailure(error)
      })
    ).filter((name) => !INTERNAL_TEMPORARY_NAME.test(name))
    const entries = await Promise.all(names.map((name) => this.readEntry(directory, name)))
    try {
      const current = await lstat(directory.absolutePath)
      if (current.isSymbolicLink()) throw new Failure('unsupported', 'The requested path is unsupported.')
      if (!current.isDirectory()) throw new Failure('invalid_path', 'The requested path is invalid.')
    } catch (error) {
      throw toFilesystemFailure(error)
    }
    return {
      path: virtualPath,
      entries: entries.filter((entry): entry is FileEntry => entry !== undefined)
    }
  }

  getConflicts(destination: ResolvedPath, candidates: ReplacementCandidate[]) {
    return getConflicts(destination.absolutePath, candidates)
  }

  resolveTargets(destination: ResolvedPath, candidates: ReplacementCandidate[], policy: ConflictPolicy) {
    return resolveReplacementTargets(destination.absolutePath, candidates, policy)
  }

  prepareSources(sources: ResolvedPath[], signal: AbortSignal, onPreparing: (name: string) => void) {
    return this.copyMove.prepareSources(sources, signal, onPreparing)
  }

  copyItem(
    item: CopyMoveItem,
    operationId: string,
    index: number,
    signal: AbortSignal,
    reportBytes: (bytes: number) => void,
    invalidateTotal: () => void,
    enterTransferring: () => void,
    enterFinalizing: () => void
  ): Promise<CopyMoveResult> {
    return this.copyMove.copyItem(item, operationId, index, signal, reportBytes, invalidateTotal, enterTransferring, enterFinalizing)
  }

  moveItem(
    item: CopyMoveItem,
    operationId: string,
    index: number,
    signal: AbortSignal,
    reportBytes: (bytes: number) => void,
    invalidateTotal: () => void,
    enterTransferring: () => void,
    enterFinalizing: () => void
  ): Promise<CopyMoveResult> {
    return this.copyMove.moveItem(item, operationId, index, signal, reportBytes, invalidateTotal, enterTransferring, enterFinalizing)
  }

  private async readEntry(directory: ResolvedPath, name: string): Promise<FileEntry | undefined> {
    let metadata
    try {
      metadata = await lstat(join(directory.absolutePath, name))
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
      if (code === 'ENOENT') return
      throw toFilesystemFailure(error)
    }
    let type: FileEntry['type'] = 'unsupported'
    if (metadata.isFile()) type = 'file'
    else if (metadata.isDirectory()) type = 'directory'
    const entry: FileEntry = {
      name,
      path: directory.virtualPath === '/' ? `/${name}` : `${directory.virtualPath}/${name}`,
      type,
      ...(type === 'file' ? { size: metadata.size } : {})
    }
    return entry
  }
}
