import type { Request } from 'express'
import type { Readable } from 'node:stream'
import type { StoredUploadPart } from '../Application/ports.js'

export interface MultipartRequestState {
  sessionId: string
  failure?: unknown
  cleanupListeners: () => void
  failureNotification: Promise<unknown>
  notifyFailure: (error: unknown) => void
  pendingWrites: Set<Promise<void>>
  cleanupFailures: unknown[]
  activeStreams: Set<Readable>
}

export interface UploadRequest extends Request {
  transferUpload?: MultipartRequestState
}

export type { StoredUploadPart }

export interface UploadManifestBody {
  manifest?: unknown
}

export function readUploadManifest(request: UploadRequest): unknown {
  const body: UploadManifestBody | undefined = request.body
  return body?.manifest
}
