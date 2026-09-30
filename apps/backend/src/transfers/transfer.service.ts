import { HttpStatus, Injectable } from '@nestjs/common'
import type { TransferEvent, TransferState } from '@raft/shared'
import { randomUUID } from 'node:crypto'
import { Subject, type Subscription } from 'rxjs'
import { ApiException } from '../api/api-exception.js'

@Injectable()
export class TransferService {
  private activeOperation?: TransferState
  private cancellation?: AbortController
  private readonly events = new Subject<TransferEvent>()

  getSnapshot(): TransferState | null {
    return this.activeOperation ?? null
  }

  subscribe(listener: (event: TransferEvent) => void): Subscription {
    return this.events.subscribe(listener)
  }

  reserveUpload(total: number): TransferState {
    return this.reserve('upload', total)
  }

  reserveCopy(total: number, destinationName: string): TransferState {
    return this.reserve('copy', total, destinationName)
  }

  reserveMove(total: number, destinationName: string): TransferState {
    return this.reserve('move', total, destinationName)
  }

  private reserve(kind: TransferState['kind'], total: number, destinationName?: string): TransferState {
    this.assertIdle()
    const operation: TransferState = {
      id: randomUUID(),
      kind,
      current: 0,
      total,
      status: 'running',
      ...(destinationName ? { destinationName } : {})
    }
    this.activeOperation = operation
    this.cancellation = new AbortController()
    this.events.next({ type: 'operation_started', operation })
    return operation
  }

  progress(id: string, current: number, currentName?: string): void {
    if (this.activeOperation?.id !== id || current < this.activeOperation.current) return
    if (current === this.activeOperation.current && currentName === this.activeOperation.currentName) return
    const operation: TransferState = { ...this.activeOperation, current, currentName }
    this.activeOperation = operation
    this.events.next({ type: 'operation_progress', operation })
  }

  complete(id: string): void {
    if (this.activeOperation?.id !== id) return
    this.activeOperation = undefined
    this.cancellation = undefined
    this.events.next({ type: 'operation_completed', operationId: id })
  }

  fail(id: string, message: string): void {
    if (this.activeOperation?.id !== id) return
    this.activeOperation = undefined
    this.cancellation = undefined
    this.events.next({ type: 'operation_failed', operationId: id, message })
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
}
