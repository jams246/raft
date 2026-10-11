import { AnyFilesInterceptor } from '@nestjs/platform-express'
import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common'
import type { Readable } from 'node:stream'
import { basename, dirname } from 'node:path'
import { type Observable, catchError, from, mergeMap, race, throwError } from 'rxjs'
import { Failure, toFailure } from '../../shared/failures.js'
import { toPresentationFailure } from './api-failures.js'
import { UploadManagement } from '../Application/upload-management.js'
import type { StoredUploadPart } from '../Application/ports.js'
import type { MultipartRequestState, UploadRequest } from './upload-request.js'
import { readUploadManifest } from './upload-request.js'

// Multipart parsing only slows down when one file's buffer fills, which small files never do, so a fast client could queue
// every part of a large folder in memory. Reading the request pauses while too many parts wait for a write slot.
const MAX_QUEUED_PARTS = 256
const RESUME_QUEUED_PARTS = MAX_QUEUED_PARTS / 2

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

    const fileInterceptor = AnyFilesInterceptor({ storage: this.createStorage(request, upload), limits: { fieldSize: this.uploads.maxManifestBytes } })
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

  private createStorage(request: UploadRequest, upload: MultipartRequestState): UploadStorage {
    const session = this.uploads.getSession(upload.sessionId)
    let readingPaused = false
    const pauseIfQueued = () => {
      if (readingPaused || upload.activeStreams.size < MAX_QUEUED_PARTS) return
      readingPaused = true
      request.pause()
    }
    const resumeIfDrained = () => {
      if (!readingPaused || upload.activeStreams.size > RESUME_QUEUED_PARTS) return
      readingPaused = false
      request.resume()
    }
    return {
      _handleFile: (_request, file, callback) => {
        if (upload.failure !== undefined) {
          file.stream.destroy()
          callback(asError(upload.failure))
          return
        }
        const currentName = this.uploads.partName(upload.sessionId, readUploadManifest(request), file.fieldname, file.originalname)
        upload.activeStreams.add(file.stream)
        pauseIfQueued()
        const write = (async () => {
          try {
            const part = await this.uploads.storePart(upload.sessionId, file, currentName)
            callback(null, { destination: dirname(part.path), filename: basename(part.path), path: part.path, size: part.size })
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
            resumeIfDrained()
          }
        })()
        track(upload.pendingWrites, write)
      },
      _removeFile: (_request, file, callback) => {
        const onRemoved = () => callback(null)
        const onRemovalFailed = (error: unknown) => {
          upload.cleanupFailures.push(error)
          callback(asError(error))
        }
        const removal = this.uploads.removePart(upload.sessionId, file.path).then(onRemoved, onRemovalFailed)
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
    while (upload.pendingWrites.size > 0) await Promise.allSettled(upload.pendingWrites)
    const primaryFailure = toPresentationFailure(upload.failure) ?? toFailure(upload.failure)
    const cleanupFailures = upload.cleanupFailures.map((cleanupError) => toPresentationFailure(cleanupError) ?? toFailure(cleanupError))
    return this.uploads.fail(upload.sessionId, primaryFailure, cleanupFailures)
  }
}

function latchFailure(upload: MultipartRequestState, error: unknown): void {
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
