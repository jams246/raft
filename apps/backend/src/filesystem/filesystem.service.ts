import { HttpStatus, Injectable } from '@nestjs/common'
import type { DirectoryListing, FileEntry } from '@raft/shared'
import { lstat, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ApiException } from '../api/api-exception.js'
import { resolveVirtualPath } from './paths.js'
import type { ValidatedPath } from './paths.js'
import { toFilesystemException } from './errors.js'

@Injectable()
export class FilesystemService {
  validateExistingPath(virtualPath: string): Promise<ValidatedPath> {
    return resolveVirtualPath(virtualPath)
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
      await mkdir(join(parent.absolutePath, name))
    } catch (error) {
      throw toFilesystemException(error)
    }
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
}
