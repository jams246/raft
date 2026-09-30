import { AnyFilesInterceptor } from '@nestjs/platform-express'
import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import { createWriteStream, type WriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import { catchError, from, mergeMap, race, throwError, type Observable } from 'rxjs'
import type { UploadRequest, StoredUploadPart } from './upload-request.js'
import { readUploadManifest } from './upload-request.js'
import { UploadFilesystemService } from '../filesystem/upload-filesystem.service.js'
import { parseUploadManifest } from '../filesystem/upload-validation.js'
import { ApiException } from './api-exception.js'
import { TransferService } from '../transfers/transfer.service.js'
import { toFilesystemException, withFilesystemFailure } from '../filesystem/errors.js'
import { StorageCapacityService } from '../filesystem/storage-capacity.service.js'
import { StreamingCapacityGuard } from '../filesystem/streaming-capacity-guard.js'

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
    private readonly uploadFilesystemService: UploadFilesystemService,
    private readonly storageCapacityService: StorageCapacityService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<UploadRequest>()
    const upload = request.transferUpload
    if (!upload) return next.handle()

    const fileInterceptor = AnyFilesInterceptor({ storage: this.createStorage(request) })
    try {
      const multipart = from(Promise.resolve(new fileInterceptor().intercept(context, next))).pipe(mergeMap((result) => result))
      const uploadFailure = from(upload.failureNotification).pipe(mergeMap((error) => throwError(() => error)))
      return race(multipart, uploadFailure).pipe(
        catchError((error: unknown) => from(this.cleanupFailedRequest(request, error)).pipe(mergeMap((failure) => throwError(() => failure))))
      )
    } catch (error) {
      return from(this.cleanupFailedRequest(request, error)).pipe(mergeMap((failure) => throwError(() => failure)))
    }
  }

  private createStorage(request: UploadRequest): UploadStorage {
    const upload = request.transferUpload!
    const capacity = new StreamingCapacityGuard(
      (requiredBytes) => this.storageCapacityService.assertAvailable(dirname(upload.stagingPath), requiredBytes),
      BigInt(upload.bytesTotal)
    )
    let itemNamesByPart: Map<number, string> | undefined
    let completedBytes = 0
    const activeOutputs = new Set<WriteStream>()
    let samplingTimer: ReturnType<typeof setInterval> | undefined
    const reportProgress = () => {
      const bytesProcessed = completedBytes + [...activeOutputs].reduce((total, output) => total + output.bytesWritten, 0)
      if (!Number.isFinite(bytesProcessed) || bytesProcessed < 0) return
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
        if (upload.failure !== undefined) {
          file.stream.destroy()
          callback(asError(upload.failure))
          return
        }
        const filename = randomUUID()
        const path = join(upload.stagingPath, filename)
        const currentName = getItemName(file.fieldname) ?? file.originalname
        this.transferService.progress(upload.id, { phase: 'transferring', currentName })
        upload.activeStreams.add(file.stream)
        const write = (async () => {
          let output: WriteStream | undefined
          let capacityTransform: ReturnType<typeof capacity.createTransform> | undefined
          try {
            await capacity.checkBeforeOutput(() => BigInt(upload.bytesTotal) - capacity.streamedBytes)
            const outputStream = createWriteStream(path, { flags: 'wx' })
            output = outputStream
            activeOutputs.add(outputStream)
            if (!samplingTimer) samplingTimer = setInterval(reportProgress, 100)
            capacityTransform = capacity.createTransform(
              () => BigInt(upload.bytesTotal) - capacity.streamedBytes,
              () => outputStream.bytesWritten
            )
            await pipeline(file.stream, capacityTransform.transform, outputStream, { signal: upload.signal })
            callback(null, { destination: upload.stagingPath, filename, path, size: outputStream.bytesWritten })
          } catch (error) {
            const primaryFailure = upload.failure ?? (error instanceof ApiException ? error : (upload.signal.reason ?? error))
            latchFailure(upload, primaryFailure)
            for (const stream of upload.activeStreams) {
              if (!stream.destroyed) stream.destroy()
            }
            let failure = primaryFailure
            try {
              await unlink(path)
            } catch (cleanupError) {
              if (!isMissing(cleanupError)) {
                failure = withFilesystemFailure(upload.failure ?? primaryFailure, 'Temporary upload data could not be removed.', cleanupError)
                upload.failure = failure
              }
            }
            failure = upload.failure ?? failure
            callback(asError(failure))
            throw failure
          } finally {
            if (output) {
              capacityTransform?.dispose()
              completedBytes += output.bytesWritten
              activeOutputs.delete(output)
            }
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
        const removal = unlink(file.path).then(
          () => callback(null),
          (error: unknown) => {
            if (!isMissing(error)) upload.cleanupFailures.push(error)
            callback(isMissing(error) ? null : asError(error))
          }
        )
        upload.pendingWrites.add(removal)
        void removal.then(
          () => upload.pendingWrites.delete(removal),
          () => upload.pendingWrites.delete(removal)
        )
      }
    }
  }

  private async cleanupFailedRequest(request: UploadRequest, error: unknown): Promise<ApiException> {
    const upload = request.transferUpload
    upload?.cleanupListeners()
    if (!upload) return toFilesystemException(error)
    latchFailure(upload, error instanceof ApiException ? error : (upload.signal.reason ?? error))
    for (const stream of upload.activeStreams) {
      if (!stream.destroyed) stream.destroy()
    }
    while (upload.pendingWrites.size > 0) await Promise.allSettled([...upload.pendingWrites])
    const primaryFailure = upload.failure
    let failure = toFilesystemException(primaryFailure)
    for (const cleanupError of upload.cleanupFailures) {
      failure = withFilesystemFailure(failure, 'Temporary upload data could not be removed.', cleanupError)
    }
    try {
      await this.uploadFilesystemService.cleanupStagingDirectory(upload.stagingPath)
    } catch (cleanupError) {
      failure = withFilesystemFailure(failure, 'Temporary upload data could not be removed.', cleanupError)
    }
    upload.failure = failure
    this.transferService.fail(upload.id, failure.message, failure.apiErrorCode)
    return failure
  }
}

function latchFailure(upload: NonNullable<UploadRequest['transferUpload']>, error: unknown): void {
  if (upload.failure !== undefined) return
  upload.failure = error
  upload.notifyFailure(error)
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('The upload failed.')
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
