import type { Request } from 'express'
import type { Readable } from 'node:stream'

export interface UploadRequestState {
  id: string
  directory: string
  stagingPath: string
  total: number
  bytesTotal: number
  failure?: unknown
  signal: AbortSignal
  cleanupListeners: () => void
  failureNotification: Promise<unknown>
  notifyFailure: (error: unknown) => void
  pendingWrites: Set<Promise<void>>
  cleanupFailures: unknown[]
  activeStreams: Set<Readable>
}

export interface UploadRequest extends Request {
  transferUpload?: UploadRequestState
}

export interface StoredUploadPart {
  fieldname: string
  path: string
  size: number
}

export interface UploadManifestBody {
  manifest?: unknown
}

export function readUploadManifest(request: UploadRequest): unknown {
  return (request.body as UploadManifestBody | undefined)?.manifest
}
