import { basename } from 'node:path'
import { Failure } from '../../shared/failures.js'
import { assertCanDownload, assertSafeArchiveName, assertUniqueDownloadNames } from '../Domain/download-policy.js'
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
    const topLevelVirtualPaths = topLevelPaths(resolvedPaths.map((path) => path.virtualPath))
    const topLevel = topLevelVirtualPaths.map((path) => resolvedPaths.find((candidate) => candidate.virtualPath === path)!)
    if (topLevel.length === 1 && !topLevel[0].isDirectory) {
      return { type: 'file', virtualPath: topLevel[0].virtualPath }
    }

    const trees = await Promise.all(topLevel.map((path) => this.filesystem.listSupportedTree(path)))
    await this.filesystem.assertReadable(trees.flatMap((tree) => tree.filter((entry) => !entry.isDirectory).map((entry) => entry.absolutePath)))
    const rootNames = topLevel.map((path) => basename(path.absolutePath))
    assertUniqueDownloadNames(rootNames)

    const entries: Extract<DownloadPlan, { type: 'archive' }>['entries'] = []
    for (const [index, tree] of trees.entries()) {
      const rootName = rootNames[index]
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
    return { type: 'archive', fileName: selectedPaths.length === 1 ? `${rootNames[0]}.zip` : 'download.zip', entries }
  }

  createArchive(plan: Extract<DownloadPlan, { type: 'archive' }>) {
    return this.archive.createArchive(plan)
  }
}
