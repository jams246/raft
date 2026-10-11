import type { FailureKind } from '../shared/failures.js'

export type TransferKind = 'upload' | 'copy' | 'move'
export type TransferPhase = 'preparing' | 'transferring' | 'finalizing'

export interface TransferState {
  id: string
  kind: TransferKind
  current: number
  total: number
  phase: TransferPhase
  bytesProcessed: number
  bytesTotal: number | null
  currentName?: string
  destinationName?: string
  status: 'running'
}

export type TransferEvent =
  | { type: 'operation_state'; operation: TransferState | null }
  | { type: 'operation_started'; operation: TransferState }
  | { type: 'operation_progress'; operation: TransferState }
  | { type: 'operation_completed'; operationId: string }
  | { type: 'operation_failed'; operationId: string; failure: { kind: FailureKind; message: string } }

export type TransferProgressUpdate = Partial<Pick<TransferState, 'current' | 'currentName' | 'phase' | 'bytesProcessed' | 'bytesTotal'>>

/** What TransferCoordination offers other contexts that run transfers through it. */
export interface TransferCoordinator {
  getSnapshot(): TransferState | null
  subscribe(listener: (event: TransferEvent) => void): () => void
  reserveUpload(total: number, bytesTotal: number): TransferState
  reserveCopy(total: number, destinationName: string): TransferState
  reserveMove(total: number, destinationName: string): TransferState
  assertIdle(): void
  assertActive(id: string): void
  getSignal(id: string): AbortSignal
  progress(id: string, update: TransferProgressUpdate): void
  complete(id: string): void
  fail(id: string, error: unknown): void
}

export const TRANSFER_COORDINATOR = Symbol('TRANSFER_COORDINATOR')
