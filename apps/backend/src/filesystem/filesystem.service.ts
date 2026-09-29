import { HttpStatus, Injectable } from '@nestjs/common'
import type { DirectoryListing, FileEntry } from '@raft/shared'
import { lstat, mkdir, open, readdir, rename, rm } from 'node:fs/promises'
import type { Readable } from 'node:stream'
import { basename, dirname, join } from 'node:path'
import { ApiException } from '../api/api-exception.js'
import { resolveVirtualPath, validateSupportedTree, validateVirtualPath } from './paths.js'
import type { ValidatedPath } from './paths.js'
import { toFilesystemException } from './errors.js'

@Injectable()
export class FilesystemService {
  // ponytail: serialize local mutations; use per-directory locks if throughput becomes a constraint.
  private mutationQueue = Promise.resolve()

  async validateExistingPath(virtualPath: string): Promise<ValidatedPath> {
    return this.validateSupportedPath(await resolveVirtualPath(virtualPath))
  }

  async openFileForDownload(virtualPath: string): Promise<{ fileName: string; stream: Readable }> {
    const validatedPath = await resolveVirtualPath(virtualPath)
    if (validatedPath.isDirectory) {
      throw new ApiException('unsupported', 'The requested path is unsupported.', HttpStatus.BAD_REQUEST)
    }

    const fileHandle = await open(validatedPath.absolutePath, 'r').catch((error: unknown) => {
      throw toFilesystemException(error)
    })
    try {
      if (!(await fileHandle.stat()).isFile()) {
        throw new ApiException('unsupported', 'The requested path is unsupported.', HttpStatus.BAD_REQUEST)
      }
      return { fileName: basename(validatedPath.absolutePath), stream: fileHandle.createReadStream({ autoClose: true }) }
    } catch (error) {
      await fileHandle.close().catch(() => {})
      throw toFilesystemException(error)
    }
  }

  async deletePaths(virtualPaths: string[]): Promise<void> {
    if (virtualPaths.length === 0) {
      throw new ApiException('invalid_request', 'Select at least one item to delete.', HttpStatus.BAD_REQUEST)
    }

    await this.runMutation(async () => {
      const selectedPaths = [...new Set(virtualPaths)]
      const validatedPaths = await Promise.all(
        selectedPaths.map(async (virtualPath) => {
          const components = validateVirtualPath(virtualPath)
          const resolvedPath = await resolveVirtualPath(virtualPath)
          if (components.length <= 1) {
            throw new ApiException('protected_root', 'Root entries cannot be deleted.', HttpStatus.BAD_REQUEST)
          }
          return this.validateSupportedPath(resolvedPath)
        })
      )
      const pathsToDelete = validatedPaths.filter(
        (candidate) =>
          !validatedPaths.some((parent) => candidate.virtualPath !== parent.virtualPath && candidate.virtualPath.startsWith(`${parent.virtualPath}/`))
      )

      let deletedCount = 0
      for (const validatedPath of pathsToDelete) {
        try {
          await rm(validatedPath.absolutePath, { recursive: true })
          deletedCount += 1
        } catch {
          throw new ApiException(
            'operation_failed',
            `Deletion stopped after deleting ${deletedCount} of ${pathsToDelete.length} selected items. Selected content may also be partially deleted.`,
            HttpStatus.INTERNAL_SERVER_ERROR
          )
        }
      }
    })
  }

  private async validateSupportedPath(validatedPath: ValidatedPath): Promise<ValidatedPath> {
    if (validatedPath.isDirectory) {
      try {
        await validateSupportedTree(validatedPath)
      } catch (error) {
        throw toFilesystemException(error)
      }
    }
    return validatedPath
  }

  async createDirectory(parentPath: string, name: string): Promise<void> {
    if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\0')) {
      throw new ApiException('invalid_request', 'The folder name is invalid.', HttpStatus.BAD_REQUEST)
    }
    if (parentPath === '/') {
      throw new ApiException('protected_root', 'Folders cannot be created at the root.', HttpStatus.BAD_REQUEST)
    }

    const parent = await resolveVirtualPath(parentPath)
    if (!parent.isDirectory) {
      throw new ApiException('invalid_path', 'The requested path is invalid.', HttpStatus.BAD_REQUEST)
    }

    try {
      await this.runMutation(() => mkdir(join(parent.absolutePath, name)))
    } catch (error) {
      throw toFilesystemException(error)
    }
  }

  async renamePath(virtualPath: string, name: string): Promise<void> {
    if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\0')) {
      throw new ApiException('invalid_request', 'The new name is invalid.', HttpStatus.BAD_REQUEST)
    }

    const components = validateVirtualPath(virtualPath)
    if (components.length <= 1) {
      throw new ApiException('protected_root', 'Root entries cannot be renamed.', HttpStatus.BAD_REQUEST)
    }

    const source = await this.validateExistingPath(virtualPath)
    const targetPath = join(dirname(source.absolutePath), name)
    await this.runMutation(async () => {
      let targetExists = true
      try {
        await lstat(targetPath)
      } catch (error) {
        const errorCode = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
        if (errorCode === 'ENOENT') targetExists = false
        else throw toFilesystemException(error)
      }
      if (targetExists) {
        throw new ApiException('conflict', 'An item with that name already exists.', HttpStatus.CONFLICT)
      }

      try {
        await rename(source.absolutePath, targetPath)
      } catch (error) {
        throw toFilesystemException(error)
      }
    })
  }

  async listDirectory(virtualPath: string): Promise<DirectoryListing> {
    const directory = await resolveVirtualPath(virtualPath)
    if (!directory.isDirectory) {
      throw new ApiException('invalid_path', 'The requested path is invalid.', HttpStatus.BAD_REQUEST)
    }

    const names = await readdir(directory.absolutePath)
    const entries = await Promise.all(
      names.map(async (name): Promise<FileEntry> => {
        const metadata = await lstat(join(directory.absolutePath, name))
        let type: FileEntry['type'] = 'unsupported'
        if (metadata.isFile()) type = 'file'
        else if (metadata.isDirectory()) type = 'directory'
        const entry: FileEntry = {
          name,
          path: virtualPath === '/' ? `/${name}` : `${virtualPath}/${name}`,
          type
        }

        if (type === 'file') entry.size = metadata.size
        if (virtualPath === '/' && type === 'directory') entry.protectedRoot = true

        return entry
      })
    )

    return { path: virtualPath, entries: entries.sort((left, right) => left.name.localeCompare(right.name)) }
  }

  private runMutation(action: () => Promise<void>): Promise<void> {
    const result = this.mutationQueue.then(action)
    this.mutationQueue = result.catch(() => {})
    return result
  }
}
