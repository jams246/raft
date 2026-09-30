import { AnyFilesInterceptor } from '@nestjs/platform-express'
import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import { createWriteStream, type WriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import { catchError, from, mergeMap, throwError, type Observable } from 'rxjs'
import type { UploadRequest, StoredUploadPart } from './upload-request.js'
import { readUploadManifest } from './upload-request.js'
import { UploadFilesystemService } from '../filesystem/upload-filesystem.service.js'
import { parseUploadManifest } from '../filesystem/upload-validation.js'
import { ApiException } from './api-exception.js'
import { TransferService } from '../transfers/transfer.service.js'

interface IncomingFile {
  fieldname: string
  originalname: string
  stream: Readable
}

interface StorageCallback {
  (error: Error | null, info?: Omit<StoredUploadPart, 'fieldname'> & { destination: string; filename: string }): void
}

interface StorageFile extends StoredUploadPart {
  destination: string
  filename: string
}

interface UploadStorage {
  _handleFile(request: UploadRequest, file: IncomingFile, callback: StorageCallback): void
  _removeFile(request: UploadRequest, file: StorageFile, callback: (error: Error | null) => void): void
}

@Injectable()
export class UploadInterceptor implements NestInterceptor {
  constructor(
    private readonly transferService: TransferService,
    private readonly uploadFilesystemService: UploadFilesystemService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<UploadRequest>()
    const upload = request.transferUpload
    if (!upload) return next.handle()

    const fileInterceptor = AnyFilesInterceptor({ storage: this.createStorage(request) })
    try {
      const multipart = Promise.resolve(new fileInterceptor().intercept(context, next))
      return from(multipart).pipe(
        mergeMap((result) => result),
        catchError((error: unknown) => from(this.cleanupFailedRequest(request, error)).pipe(mergeMap(() => throwError(() => error))))
      )
    } catch (error) {
      return from(this.cleanupFailedRequest(request, error)).pipe(mergeMap(() => throwError(() => error)))
    }
  }

  private createStorage(request: UploadRequest): UploadStorage {
    const upload = request.transferUpload!
    let itemNamesByPart: Map<number, string> | undefined
    let completedBytes = 0
    const activeOutputs = new Set<WriteStream>()
    let samplingTimer: ReturnType<typeof setInterval> | undefined
    const reportProgress = () => {
      const bytesProcessed = completedBytes + [...activeOutputs].reduce((total, output) => total + output.bytesWritten, 0)
      if (!Number.isFinite(bytesProcessed) || bytesProcessed < 0) return
      if (upload.bytesTotal !== null && bytesProcessed > upload.bytesTotal) upload.bytesTotal = null
      this.transferService.progress(upload.id, { phase: 'transferring', bytesProcessed, bytesTotal: upload.bytesTotal })
    }
    const getItemName = (fieldname: string): string | undefined => {
      const match = /^file(\d+)$/.exec(fieldname)
      if (!match) return undefined
      if (!itemNamesByPart) {
        try {
          const manifest = parseUploadManifest(readUploadManifest(request), upload.total)
          itemNamesByPart = new Map(manifest.items.flatMap((item) => item.files.map((file) => [file.part, item.name] as const)))
        } catch {
          return undefined
        }
      }
      return itemNamesByPart.get(Number(match[1]))
    }

    return {
      _handleFile: (_request, file, callback) => {
        const filename = randomUUID()
        const path = join(upload.stagingPath, filename)
        const output = createWriteStream(path, { flags: 'wx' })
        const currentName = getItemName(file.fieldname) ?? file.originalname
        this.transferService.progress(upload.id, { phase: 'transferring', currentName })
        activeOutputs.add(output)
        if (!samplingTimer) samplingTimer = setInterval(reportProgress, 100)
        upload.activeStreams.add(file.stream)
        const write = (async () => {
          try {
            await pipeline(file.stream, output, { signal: upload.signal })
            callback(null, { destination: upload.stagingPath, filename, path, size: output.bytesWritten })
          } catch (error) {
            await unlink(path).catch(() => undefined)
            callback(asError(error))
            throw error
          } finally {
            completedBytes += output.bytesWritten
            activeOutputs.delete(output)
            upload.activeStreams.delete(file.stream)
            reportProgress()
            if (activeOutputs.size === 0 && samplingTimer) {
              clearInterval(samplingTimer)
              samplingTimer = undefined
            }
          }
        })()
        upload.pendingWrites.add(write)
        void write.then(
          () => upload.pendingWrites.delete(write),
          () => upload.pendingWrites.delete(write)
        )
      },
      _removeFile: (_request, file, callback) => {
        void unlink(file.path).then(
          () => callback(null),
          (error: unknown) => callback(isMissing(error) ? null : asError(error))
        )
      }
    }
  }

  private async cleanupFailedRequest(request: UploadRequest, error: unknown): Promise<void> {
    const upload = request.transferUpload
    upload?.cleanupListeners()
    if (!upload || this.transferService.getSnapshot()?.id !== upload.id) return
    await Promise.allSettled([...upload.pendingWrites])
    try {
      await this.uploadFilesystemService.cleanupStagingDirectory(upload.stagingPath)
      const failure = error instanceof ApiException ? error : (upload.signal.reason ?? error)
      this.transferService.fail(upload.id, failure instanceof ApiException ? failure.message : 'The upload failed.')
    } catch {
      this.transferService.fail(upload.id, 'The upload failed and temporary data could not be removed.')
    }
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('The upload failed.')
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
