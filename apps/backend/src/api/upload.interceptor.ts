import { AnyFilesInterceptor } from '@nestjs/platform-express'
import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import { createWriteStream } from 'node:fs'
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
    let items: Array<{ name: string; remaining: number }> | undefined
    const pendingParts = new Map<number, number>()
    let current = 0
    const updateProgress = (fieldname: string) => {
      const partMatch = /^file(\d+)$/.exec(fieldname)
      if (!partMatch) return
      if (!items) {
        const manifest = parseUploadManifest(readUploadManifest(request), upload.total)
        items = manifest.items.map((item, index) => {
          for (const file of item.files) pendingParts.set(file.part, index)
          return { name: item.name, remaining: item.files.length }
        })
      }
      const part = Number(partMatch[1])
      const itemIndex = pendingParts.get(part)
      if (itemIndex === undefined) return
      pendingParts.delete(part)
      items[itemIndex].remaining -= 1
      if (items[itemIndex].remaining === 0) this.transferService.progress(upload.id, ++current, items[itemIndex].name)
    }

    return {
      _handleFile: (_request, file, callback) => {
        const filename = randomUUID()
        const path = join(upload.stagingPath, filename)
        const output = createWriteStream(path, { flags: 'wx' })
        upload.activeStreams.add(file.stream)
        const write = (async () => {
          try {
            await pipeline(file.stream, output, { signal: upload.signal })
            updateProgress(file.fieldname)
            callback(null, { destination: upload.stagingPath, filename, path, size: output.bytesWritten })
          } catch (error) {
            await unlink(path).catch(() => undefined)
            callback(asError(error))
            throw error
          } finally {
            upload.activeStreams.delete(file.stream)
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
