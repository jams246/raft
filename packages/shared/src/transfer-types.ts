export type TransferKind = 'upload' | 'copy' | 'move'

export interface TransferState {
  id: string
  kind: TransferKind
  current: number
  total: number
  phase: 'preparing' | 'transferring' | 'finalizing'
  bytesProcessed: number
  bytesTotal: number | null
  currentName?: string
  destinationName?: string
  status: 'running'
}

import type { ApiErrorCode } from './api-types.js'

export type TransferEvent =
  | { type: 'operation_state'; operation: TransferState | null }
  | { type: 'operation_started'; operation: TransferState }
  | { type: 'operation_progress'; operation: TransferState }
  | { type: 'operation_completed'; operationId: string }
  | { type: 'operation_failed'; operationId: string; error: ApiErrorCode; message: string }
  | { type: 'directory_changed'; path: string }

export type ConflictPolicy = 'rename' | 'overwrite'
export type UploadConflictPolicy = ConflictPolicy

export interface UploadManifestItem {
  name: string
  type: 'file' | 'directory'
  files: Array<{ part: number; path: string }>
}

export interface UploadManifest {
  items: UploadManifestItem[]
}

export interface UploadConflict {
  name: string
  suggestedName: string
}

export interface CopyConflict {
  source: string
  existingName: string
  suggestedName: string
}
