import type { TransferCoordinator } from '../../contracts/transfer-coordination.js'
import { Failure, toFailure } from '../../shared/failures.js'
import {
  type TransferEvent as DomainTransferEvent,
  type TransferState as DomainTransferState,
  type ProgressUpdate,
  type TransferKind,
  TransferOperation
} from '../Domain/transfer-operation.js'
import type { TransferRuntimePort } from './ports.js'

const PROGRESS_INTERVAL_MS = 100

export type TransferEvent = DomainTransferEvent
export type TransferState = DomainTransferState

interface ActiveTransfer {
  operation: TransferOperation
  cancellation: ReturnType<TransferRuntimePort['createCancellation']>
  timer: unknown
}

// Implementing the contract makes the compiler flag any drift between it and this context's Domain types.
export class TransferCoordination implements TransferCoordinator {
  private active: ActiveTransfer | undefined

  constructor(private readonly runtime: TransferRuntimePort) {}

  getSnapshot(): TransferState | null {
    return this.active?.operation.state ?? null
  }

  subscribe(listener: (event: TransferEvent) => void): () => void {
    return this.runtime.subscribe(listener)
  }

  reserveUpload(total: number, bytesTotal: number): TransferState {
    return this.reserve('upload', total, undefined, bytesTotal)
  }

  reserveCopy(total: number, destinationName: string): TransferState {
    return this.reserve('copy', total, destinationName)
  }

  reserveMove(total: number, destinationName: string): TransferState {
    return this.reserve('move', total, destinationName)
  }

  assertIdle(): void {
    TransferOperation.assertIdle(this.active?.operation)
  }

  assertActive(id: string): void {
    if (this.active?.operation.state.id !== id) throw new Failure('operation_busy', 'The transfer is no longer active.')
  }

  getSignal(id: string): AbortSignal {
    const active = this.active
    if (active?.operation.state.id !== id) throw new Failure('operation_busy', 'The transfer is no longer active.')
    return active.cancellation.signal
  }

  progress(id: string, update: ProgressUpdate): void {
    const active = this.active
    if (active?.operation.state.id !== id) return
    const changed = active.operation.progress(update)
    if (!changed) return

    if (changed.immediate) {
      this.clearProgressTimer(active)
      this.runtime.publish({ type: 'operation_progress', operation: changed.state })
      return
    }
    if (active.timer === undefined) {
      active.timer = this.runtime.schedule(() => {
        active.timer = undefined
        if (this.active === active) this.runtime.publish({ type: 'operation_progress', operation: active.operation.state })
      }, PROGRESS_INTERVAL_MS)
    }
  }

  complete(id: string): void {
    const active = this.active
    if (active?.operation.state.id !== id) return
    this.clearProgressTimer(active)
    const event = active.operation.complete()
    this.active = undefined
    this.runtime.publish(event)
  }

  fail(id: string, error: unknown): void {
    const active = this.active
    if (active?.operation.state.id !== id) return
    this.clearProgressTimer(active)
    const event = active.operation.fail(toFailure(error))
    this.active = undefined
    this.runtime.publish(event)
  }

  cancel(id: string, kind: 'upload' | 'copy'): void {
    const active = this.active
    if (active?.operation.state.id !== id || active.operation.state.kind !== kind) {
      throw new Failure('not_found', `This ${kind} is no longer active.`)
    }
    const label = kind === 'upload' ? 'Upload' : 'Copy'
    active.cancellation.abort(new Failure('cancelled', `${label} cancelled. Any completed items were kept.`))
  }

  private reserve(kind: TransferKind, total: number, destinationName?: string, bytesTotal: number | null = null): TransferState {
    this.assertIdle()
    const operation = new TransferOperation(this.runtime.createId(), kind, total, destinationName, bytesTotal)
    const active: ActiveTransfer = { operation, cancellation: this.runtime.createCancellation(), timer: undefined }
    this.active = active
    this.runtime.publish({ type: 'operation_started', operation: operation.state })
    return operation.state
  }

  private clearProgressTimer(active: ActiveTransfer): void {
    if (active.timer === undefined) return
    this.runtime.cancelSchedule(active.timer)
    active.timer = undefined
  }
}
