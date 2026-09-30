import { once } from 'node:events'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { ZipArchive } from 'archiver'
import { Failure } from '../../shared/failures.js'
import type { ArchiveDownload, DownloadContentPort, DownloadPlan } from '../Application/ports.js'
import { toFilesystemFailure } from './filesystem-failures.js'

export class DownloadArchiveAdapter implements DownloadContentPort {
  createArchive(plan: Extract<DownloadPlan, { type: 'archive' }>): ArchiveDownload {
    const archive = new ZipArchive({ forceZip64: true, store: true })
    const cancellation = new AbortController()
    archive.on('warning', (error) => archive.emit('error', toFilesystemFailure(error)))
    return {
      stream: archive,
      start: () =>
        this.appendArchive(plan, archive, cancellation.signal).catch((error: unknown) => {
          throw toFilesystemFailure(error)
        }),
      stop: () => {
        cancellation.abort()
        archive.abort()
        archive.destroy()
      }
    }
  }

  private async appendArchive(plan: Extract<DownloadPlan, { type: 'archive' }>, archive: ZipArchive, signal: AbortSignal): Promise<void> {
    for (const entry of plan.entries) {
      signal.throwIfAborted()
      const handle = entry.isDirectory
        ? undefined
        : await open(entry.absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch((error: unknown) => {
            throw toFilesystemFailure(error)
          })
      const source = handle?.createReadStream()
      const stop = () => source?.destroy()
      signal.addEventListener('abort', stop, { once: true })
      source?.on('error', (error) => archive.emit('error', toFilesystemFailure(error)))
      try {
        signal.throwIfAborted()
        if (handle && !(await handle.stat()).isFile()) throw new Failure('unsupported', 'The requested path is unsupported.')
        signal.throwIfAborted()
        const processed = once(archive, 'entry', { signal })
        archive.append(source ?? '', { name: entry.name, date: entry.modifiedAt, mode: entry.mode, type: entry.isDirectory ? 'directory' : 'file' })
        await processed
        if (source && source.bytesRead !== entry.size) {
          throw new Failure('operation_failed', 'A source file changed during download.')
        }
      } finally {
        signal.removeEventListener('abort', stop)
        source?.destroy()
      }
    }
    await archive.finalize()
  }
}
