import { basename } from 'node:path'
import { elementAt } from '../../shared/collections.js'
import { Failure } from '../../shared/failures.js'
import { assertCanDownload, assertSafeArchiveName, assertUniqueDownloadNames } from '../Domain/download-policy.js'
import type { ResolvedPath } from '../Domain/models.js'
import { topLevelPaths } from '../Domain/path-policy.js'
import type { DownloadContentPort, DownloadPlan, FileSystemPort } from './ports.js'

export class DownloadUseCases {
  constructor(
    private readonly filesystem: FileSystemPort,
    private readonly archive: DownloadContentPort
  ) {}

  async prepare(virtualPaths: string[]): Promise<DownloadPlan> {
    if (virtualPaths.length === 0) throw new Failure('invalid_request', 'Select at least one item to download.')
    const selectedPaths = [...new Set(virtualPaths)]
    const resolvedPaths = await Promise.all(
      selectedPaths.map(async (virtualPath) => {
        assertCanDownload(virtualPath)
        return this.filesystem.resolvePath(virtualPath)
      })
    )
    const topLevel = selectTopLevel(resolvedPaths)
    const [onlyItem] = topLevel
    if (topLevel.length === 1 && onlyItem !== undefined && !onlyItem.isDirectory) {
      return { type: 'file', virtualPath: onlyItem.virtualPath }
    }

    const trees = await Promise.all(topLevel.map((path) => this.filesystem.listSupportedTree(path)))
    await this.filesystem.assertReadable(trees.flatMap((tree) => tree.filter((entry) => !entry.isDirectory).map((entry) => entry.absolutePath)))
    const rootNames = topLevel.map((path) => basename(path.absolutePath))
    assertUniqueDownloadNames(rootNames)

    const entries: Extract<DownloadPlan, { type: 'archive' }>['entries'] = []
    for (const [index, tree] of trees.entries()) {
      const rootName = elementAt(rootNames, index)
      assertSafeArchiveName(rootName, tree[0]?.isDirectory ?? false)
      for (const entry of tree) {
        const name = entry.relativePath ? `${rootName}/${entry.relativePath}` : rootName
        assertSafeArchiveName(name, entry.isDirectory)
        entries.push({
          name: entry.isDirectory ? `${name}/` : name,
          absolutePath: entry.absolutePath,
          isDirectory: entry.isDirectory,
          size: entry.size,
          modifiedAt: entry.modifiedAt,
          mode: entry.mode
        })
      }
    }
    return { type: 'archive', fileName: selectedPaths.length === 1 ? `${elementAt(rootNames, 0)}.zip` : 'download.zip', entries }
  }

  createArchive(plan: Extract<DownloadPlan, { type: 'archive' }>) {
    return this.archive.createArchive(plan)
  }
}

function selectTopLevel(resolvedPaths: ResolvedPath[]): ResolvedPath[] {
  const resolvedByVirtualPath = new Map(resolvedPaths.map((path) => [path.virtualPath, path]))
  return topLevelPaths(resolvedPaths.map((path) => path.virtualPath)).map((path) => {
    const resolved = resolvedByVirtualPath.get(path)
    if (resolved === undefined) throw new RangeError(`Top-level path ${path} was not among the resolved selection.`)
    return resolved
  })
}
