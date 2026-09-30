import { AnyFilesInterceptor } from '@nestjs/platform-express'
import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import type { Readable } from 'node:stream'
import { basename } from 'node:path'
import { catchError, from, mergeMap, race, throwError, type Observable } from 'rxjs'
import { Failure, toFailure } from '../../shared/failures.js'
import { toPresentationFailure } from '../../shared/api-failure.filter.js'
import { UploadManagement } from '../Application/upload-management.js'
import type { StoredUploadPart } from '../Application/ports.js'
import type { UploadRequest } from './upload-request.js'
import { readUploadManifest } from './upload-request.js'

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
  constructor(private readonly uploads: UploadManagement) {}

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
    const session = this.uploads.getSession(upload.sessionId)
    return {
      _handleFile: (_request, file, callback) => {
        if (upload.failure !== undefined) {
          file.stream.destroy()
          callback(asError(upload.failure))
          return
        }
        const currentName = this.uploads.partName(upload.sessionId, readUploadManifest(request), file.fieldname, file.originalname)
        upload.activeStreams.add(file.stream)
        const write = (async () => {
          try {
            const part = await this.uploads.storePart(upload.sessionId, file, currentName)
            callback(null, { destination: session.stagingPath!, filename: basename(part.path), path: part.path, size: part.size })
          } catch (error) {
            const primaryFailure = error instanceof Failure ? error : (session.signal.reason ?? toPresentationFailure(error) ?? toFailure(error))
            const failure = upload.failure ?? primaryFailure
            latchFailure(upload, failure)
            for (const stream of upload.activeStreams) {
              if (!stream.destroyed) stream.destroy()
            }
            callback(asError(upload.failure))
            throw upload.failure
          } finally {
            upload.activeStreams.delete(file.stream)
          }
        })()
        track(upload.pendingWrites, write)
      },
      _removeFile: (_request, file, callback) => {
        const removal = this.uploads.removePart(upload.sessionId, file.path).then(
          () => callback(null),
          (error: unknown) => {
            upload.cleanupFailures.push(error)
            callback(asError(error))
          }
        )
        track(upload.pendingWrites, removal)
      }
    }
  }

  private async cleanupFailedRequest(request: UploadRequest, error: unknown): Promise<Failure> {
    const upload = request.transferUpload
    if (!upload) return toPresentationFailure(error) ?? toFailure(error)
    upload.cleanupListeners()
    const session = this.uploads.getSession(upload.sessionId)
    latchFailure(upload, error instanceof Failure ? error : (session.signal.reason ?? toPresentationFailure(error) ?? error))
    for (const stream of upload.activeStreams) {
      if (!stream.destroyed) stream.destroy()
    }
    while (upload.pendingWrites.size > 0) await Promise.allSettled([...upload.pendingWrites])
    const primaryFailure = toPresentationFailure(upload.failure) ?? toFailure(upload.failure)
    const cleanupFailures = upload.cleanupFailures.map((cleanupError) => toPresentationFailure(cleanupError) ?? toFailure(cleanupError))
    return this.uploads.fail(upload.sessionId, primaryFailure, cleanupFailures)
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

function track(pendingWrites: Set<Promise<void>>, write: Promise<void>): void {
  pendingWrites.add(write)
  void write.then(
    () => pendingWrites.delete(write),
    () => pendingWrites.delete(write)
  )
}
