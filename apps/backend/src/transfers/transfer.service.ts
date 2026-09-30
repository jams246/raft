import { HttpStatus, Injectable } from '@nestjs/common'
import type { ApiErrorCode, TransferEvent, TransferState } from '@raft/shared'
import { randomUUID } from 'node:crypto'
import { Subject, type Subscription } from 'rxjs'
import { ApiException } from '../api/api-exception.js'

@Injectable()
export class TransferService {
  private activeOperation?: TransferState
  private cancellation?: AbortController
  private progressTimer?: ReturnType<typeof setTimeout>
  private readonly events = new Subject<TransferEvent>()

  getSnapshot(): TransferState | null {
    return this.activeOperation ?? null
  }

  subscribe(listener: (event: TransferEvent) => void): Subscription {
    return this.events.subscribe(listener)
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

  private reserve(kind: TransferState['kind'], total: number, destinationName?: string, bytesTotal: number | null = null): TransferState {
    this.assertIdle()
    this.clearProgressTimer()
    const operation: TransferState = {
      id: randomUUID(),
      kind,
      current: 0,
      total,
      phase: 'preparing',
      bytesProcessed: 0,
      bytesTotal,
      status: 'running',
      ...(destinationName ? { destinationName } : {})
    }
    this.activeOperation = operation
    this.cancellation = new AbortController()
    this.events.next({ type: 'operation_started', operation })
    return operation
  }

  progress(id: string, update: Partial<Pick<TransferState, 'current' | 'currentName' | 'phase' | 'bytesProcessed' | 'bytesTotal'>>): void {
    const activeOperation = this.activeOperation
    if (activeOperation?.id !== id) return
    const current = update.current === undefined ? activeOperation.current : Math.max(activeOperation.current, normalizeCount(update.current))
    const bytesProcessed =
      update.bytesProcessed === undefined ? activeOperation.bytesProcessed : Math.max(activeOperation.bytesProcessed, normalizeCount(update.bytesProcessed))
    const requestedTotal = 'bytesTotal' in update ? normalizeTotal(update.bytesTotal) : activeOperation.bytesTotal
    const stableTotal = activeOperation.bytesTotal === null && activeOperation.phase !== 'preparing' && requestedTotal !== null ? null : requestedTotal
    const bytesTotal = stableTotal !== null && stableTotal < bytesProcessed ? null : stableTotal
    const phase = update.phase ?? activeOperation.phase
    const currentName = update.currentName ?? activeOperation.currentName
    const changed =
      current !== activeOperation.current ||
      currentName !== activeOperation.currentName ||
      phase !== activeOperation.phase ||
      bytesProcessed !== activeOperation.bytesProcessed ||
      bytesTotal !== activeOperation.bytesTotal
    if (!changed) return

    const operation: TransferState = { ...activeOperation, current, currentName, phase, bytesProcessed, bytesTotal }
    this.activeOperation = operation
    const mustEmitNow = current !== activeOperation.current || currentName !== activeOperation.currentName || phase !== activeOperation.phase
    if (mustEmitNow) {
      this.clearProgressTimer()
      this.emitProgress(operation)
      return
    }
    if (!this.progressTimer) {
      this.progressTimer = setTimeout(() => {
        this.progressTimer = undefined
        if (this.activeOperation?.id === id) this.emitProgress(this.activeOperation)
      }, 100)
    }
  }

  complete(id: string): void {
    if (this.activeOperation?.id !== id) return
    this.clearProgressTimer()
    this.activeOperation = undefined
    this.cancellation = undefined
    this.events.next({ type: 'operation_completed', operationId: id })
  }

  fail(id: string, message: string, error: ApiErrorCode = 'operation_failed'): void {
    if (this.activeOperation?.id !== id) return
    this.clearProgressTimer()
    this.activeOperation = undefined
    this.cancellation = undefined
    this.events.next({ type: 'operation_failed', operationId: id, error, message })
  }

  assertIdle(): void {
    if (this.activeOperation) throw new ApiException('operation_busy', 'Another file operation is already running.', HttpStatus.CONFLICT)
  }

  getSignal(id: string): AbortSignal {
    this.assertActive(id)
    return this.cancellation!.signal
  }

  cancelUpload(id: string): void {
    if (this.activeOperation?.id !== id || this.activeOperation.kind !== 'upload') {
      throw new ApiException('not_found', 'This upload is no longer active.', HttpStatus.NOT_FOUND)
    }
    this.cancellation!.abort(new ApiException('operation_failed', 'Upload cancelled. Any completed items were kept.', HttpStatus.CONFLICT))
  }

  assertActive(id: string): void {
    if (this.activeOperation?.id !== id) throw new ApiException('operation_busy', 'The transfer is no longer active.', HttpStatus.CONFLICT)
  }

  private emitProgress(operation: TransferState): void {
    this.events.next({ type: 'operation_progress', operation })
  }

  private clearProgressTimer(): void {
    if (!this.progressTimer) return
    clearTimeout(this.progressTimer)
    this.progressTimer = undefined
  }
}

function normalizeCount(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function normalizeTotal(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null
}
