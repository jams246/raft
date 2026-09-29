import { HttpStatus, Injectable } from '@nestjs/common'
import type { ZipArchive } from 'archiver'
import { once } from 'node:events'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { basename } from 'node:path'
import { ApiException } from '../api/api-exception.js'
import { toFilesystemException } from '../filesystem/errors.js'
import { listSupportedTree, resolveVirtualPath, validateVirtualPath } from '../filesystem/paths.js'
import type { SupportedTreeEntry } from '../filesystem/paths.js'

export interface ArchiveEntry {
  name: string
  entry: SupportedTreeEntry
}

export type DownloadPlan = { type: 'file'; virtualPath: string } | { type: 'archive'; fileName: string; entries: ArchiveEntry[] }

@Injectable()
export class DownloadsService {
  async prepare(virtualPaths: string[]): Promise<DownloadPlan> {
    if (virtualPaths.length === 0) {
      throw new ApiException('invalid_request', 'Select at least one item to download.', HttpStatus.BAD_REQUEST)
    }

    const selectedPaths = [...new Set(virtualPaths)]
    const resolvedPaths = await Promise.all(
      selectedPaths.map(async (virtualPath) => {
        if (validateVirtualPath(virtualPath).length === 0) {
          throw new ApiException('invalid_path', 'The requested path is invalid.', HttpStatus.BAD_REQUEST)
        }
        return resolveVirtualPath(virtualPath)
      })
    )
    const topLevelPaths = resolvedPaths.filter((candidate) => !resolvedPaths.some((parent) => candidate.virtualPath.startsWith(`${parent.virtualPath}/`)))
    if (topLevelPaths.length === 1 && !topLevelPaths[0].isDirectory) {
      return { type: 'file', virtualPath: topLevelPaths[0].virtualPath }
    }

    const trees = await Promise.all(
      topLevelPaths.map(async (path) => {
        try {
          return await listSupportedTree(path)
        } catch (error) {
          throw toFilesystemException(error)
        }
      })
    )

    const rootNames = topLevelPaths.map((path) => basename(path.absolutePath))
    const uniqueRootNames = new Set(rootNames)
    if (uniqueRootNames.size !== rootNames.length) {
      throw new ApiException('conflict', 'Selected items have duplicate names.', HttpStatus.CONFLICT)
    }

    const entries: ArchiveEntry[] = []
    for (const [index, tree] of trees.entries()) {
      const rootName = rootNames[index]
      if (rootName.includes('\\') || /^\w+:/.test(rootName)) this.rejectUnsafeArchiveName()
      for (const entry of tree) {
        if (entry.relativePath.includes('\\')) this.rejectUnsafeArchiveName()
        const name = entry.relativePath ? `${rootName}/${entry.relativePath}` : rootName
        if (Buffer.byteLength(name) + Number(entry.isDirectory) > 0xffff) this.rejectUnsafeArchiveName()
        entries.push({ name: entry.isDirectory ? `${name}/` : name, entry })
      }
    }

    return { type: 'archive', fileName: selectedPaths.length === 1 ? `${rootNames[0]}.zip` : 'download.zip', entries }
  }

  async appendArchive(plan: Extract<DownloadPlan, { type: 'archive' }>, archive: ZipArchive, signal: AbortSignal): Promise<void> {
    for (const { name, entry } of plan.entries) {
      signal.throwIfAborted()
      const handle = entry.isDirectory ? undefined : await open(entry.absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      const source = handle?.createReadStream()
      const stop = () => source?.destroy()
      signal.addEventListener('abort', stop, { once: true })
      source?.on('error', (error) => archive.emit('error', error))
      try {
        signal.throwIfAborted()
        if (handle && !(await handle.stat()).isFile()) {
          throw new ApiException('unsupported', 'The requested path is unsupported.', HttpStatus.BAD_REQUEST)
        }
        signal.throwIfAborted()
        const processed = once(archive, 'entry', { signal })
        archive.append(source ?? '', { name, date: entry.stats.mtime, mode: entry.stats.mode, type: entry.isDirectory ? 'directory' : 'file' })
        await processed
        if (source && source.bytesRead !== entry.stats.size) {
          throw new ApiException('operation_failed', 'A source file changed during download.', HttpStatus.INTERNAL_SERVER_ERROR)
        }
      } finally {
        signal.removeEventListener('abort', stop)
        source?.destroy()
      }
    }
    await archive.finalize()
  }

  private rejectUnsafeArchiveName(): never {
    throw new ApiException('unsupported', 'Selected items contain names that cannot be safely stored in a ZIP.', HttpStatus.BAD_REQUEST)
  }
}
