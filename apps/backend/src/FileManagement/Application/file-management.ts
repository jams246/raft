import { Failure } from '../../shared/failures.js'
import {
  assertCanCreateDirectory,
  assertCanDelete,
  assertCanDeletePath,
  assertCanRename,
  isProtectedRootDirectory,
  topLevelPaths
} from '../Domain/path-policy.js'
import type { FileSystemPort, MutationSerializationPort } from './ports.js'

export class FileManagement {
  constructor(
    private readonly filesystem: FileSystemPort,
    private readonly mutations: MutationSerializationPort
  ) {}

  async listDirectory(virtualPath: string) {
    const directory = await this.filesystem.validateDirectory(virtualPath)
    const listing = await this.filesystem.listDirectory(directory)
    return {
      path: listing.path,
      entries: listing.entries
        .map((entry) => (isProtectedRootDirectory(listing.path, entry.type) ? { ...entry, protectedRoot: true } : entry))
        .sort((left, right) => left.name.localeCompare(right.name))
    }
  }

  validateDirectory(virtualPath: string) {
    return this.filesystem.validateDirectory(virtualPath)
  }

  async openFileForDownload(virtualPath: string) {
    const path = await this.filesystem.resolvePath(virtualPath)
    if (path.isDirectory) throw new Failure('unsupported', 'The requested path is unsupported.')
    return this.filesystem.openFileForDownload(path)
  }

  createDirectory(parentPath: string, name: string): Promise<void> {
    this.mutations.assertIdle()
    assertCanCreateDirectory(parentPath, name)
    return this.filesystem.validateDirectory(parentPath).then((parent) => this.mutations.runMutation(() => this.filesystem.createDirectory(parent, name)))
  }

  renamePath(virtualPath: string, name: string): Promise<void> {
    this.mutations.assertIdle()
    assertCanRename(virtualPath, name)
    return this.filesystem.validateExistingPath(virtualPath).then((source) => this.mutations.runMutation(() => this.filesystem.renamePath(source, name)))
  }

  deletePaths(virtualPaths: string[]): Promise<void> {
    this.mutations.assertIdle()
    assertCanDelete(virtualPaths)
    return this.mutations.runMutation(async () => {
      const selectedPaths = [...new Set(virtualPaths)]
      const paths = await Promise.all(
        selectedPaths.map(async (virtualPath) => {
          const path = await this.filesystem.resolvePath(virtualPath)
          assertCanDeletePath(virtualPath)
          if (path.isDirectory) await this.filesystem.validateSupportedTree(path)
          return path
        })
      )
      const topLevel = new Set(topLevelPaths(paths.map((path) => path.virtualPath)))
      return this.filesystem.deletePaths(paths.filter((path) => topLevel.has(path.virtualPath)))
    })
  }
}
