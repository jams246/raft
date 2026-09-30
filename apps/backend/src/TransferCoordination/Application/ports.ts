import type { Failure } from '../../shared/failures.js'
import type { TransferEvent } from '../Domain/transfer-operation.js'

export interface TransferCancellation {
  signal: AbortSignal
  abort(reason: Failure): void
}

export interface TransferRuntimePort {
  createId(): string
  createCancellation(): TransferCancellation
  schedule(callback: () => void, delayMs: number): unknown
  cancelSchedule(handle: unknown): void
  publish(event: TransferEvent): void
  subscribe(listener: (event: TransferEvent) => void): () => void
}

export const TRANSFER_RUNTIME = Symbol('TRANSFER_RUNTIME')
