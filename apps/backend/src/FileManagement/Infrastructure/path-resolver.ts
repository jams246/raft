import type { Stats } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Failure } from '../../shared/failures.js'
import type { ResolvedPath } from '../Domain/models.js'
import { INTERNAL_TEMPORARY_NAME, validateVirtualPath } from '../Domain/path-policy.js'
import { toFilesystemFailure } from './filesystem-failures.js'

export const DATA_ROOT = '/data'

export interface SupportedTreeEntry {
  absolutePath: string
  relativePath: string
  isDirectory: boolean
  stats: Stats
}

export class PathResolver {
  async resolve(virtualPath: string): Promise<ResolvedPath> {
    const components = validateVirtualPath(virtualPath)
    let absolutePath = DATA_ROOT
    let currentStat = await this.inspect(DATA_ROOT)
    if (!currentStat.isDirectory()) throw new Failure('unsupported', 'The requested path is unsupported.')

    for (const component of components) {
      if (!currentStat.isDirectory()) throw new Failure('invalid_path', 'The requested path is invalid.')
      absolutePath = join(absolutePath, component)
      currentStat = await this.inspect(absolutePath)
      if (currentStat.isSymbolicLink() || (!currentStat.isDirectory() && !currentStat.isFile())) {
        throw new Failure('unsupported', 'The requested path is unsupported.')
      }
    }
    return { virtualPath, absolutePath, isDirectory: currentStat.isDirectory() }
  }

  async listSupportedTree(path: ResolvedPath, signal?: AbortSignal): Promise<SupportedTreeEntry[]> {
    const entries: SupportedTreeEntry[] = []
    await this.visitSupportedTree(path.absolutePath, '', (entry) => entries.push(entry), signal)
    return entries
  }

  async validateSupportedTree(path: ResolvedPath): Promise<void> {
    await this.visitSupportedTree(path.absolutePath, '')
  }

  private async visitSupportedTree(
    absolutePath: string,
    relativePath: string,
    visit?: (entry: SupportedTreeEntry) => void,
    signal?: AbortSignal
  ): Promise<void> {
    signal?.throwIfAborted()
    const stats = await this.inspect(absolutePath)
    if (!stats.isDirectory() && !stats.isFile()) throw new Failure('unsupported', 'The requested path is unsupported.')
    visit?.({ absolutePath, relativePath, isDirectory: stats.isDirectory(), stats })
    if (!stats.isDirectory()) return

    const names = await readdir(absolutePath).catch((error: unknown) => {
      throw toFilesystemFailure(error)
    })
    if (visit) names.sort((left, right) => left.localeCompare(right))
    for (const name of names) {
      await this.visitSupportedTree(join(absolutePath, name), relativePath ? `${relativePath}/${name}` : name, visit, signal)
    }
  }

  private async inspect(absolutePath: string) {
    try {
      const metadata = await lstat(absolutePath)
      if (metadata.isSymbolicLink()) throw new Failure('unsupported', 'The requested path is unsupported.')
      return metadata
    } catch (error) {
      throw toFilesystemFailure(error)
    }
  }
}

export { INTERNAL_TEMPORARY_NAME, validateVirtualPath }

export function resolveVirtualPath(virtualPath: string): Promise<ResolvedPath> {
  return new PathResolver().resolve(virtualPath)
}
