import { Injectable } from '@nestjs/common'
import type { DirectoryListing, FileEntry } from '@raft/shared'
import { readdir } from 'node:fs/promises'
import { resolveVirtualPath } from './paths.js'
import type { ValidatedPath } from './paths.js'

@Injectable()
export class FilesystemService {
  validateExistingPath(virtualPath: string): Promise<ValidatedPath> {
    return resolveVirtualPath(virtualPath)
  }

  async listRoots(): Promise<DirectoryListing> {
    const { absolutePath } = await resolveVirtualPath('/')
    const rootEntries = await readdir(absolutePath, { withFileTypes: true })
    const entries = rootEntries.map((rootEntry): FileEntry => {
      let type: FileEntry['type']
      if (rootEntry.isDirectory()) type = 'directory'
      else if (rootEntry.isFile()) type = 'file'
      else type = 'unsupported'

      const entry: FileEntry = {
        name: rootEntry.name,
        path: `/${rootEntry.name}`,
        type
      }

      if (type === 'directory') entry.protectedRoot = true

      return entry
    })

    return { path: '/', entries: entries.sort((left, right) => left.name.localeCompare(right.name)) }
  }
}
