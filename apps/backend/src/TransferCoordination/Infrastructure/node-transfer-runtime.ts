import { randomUUID } from 'node:crypto'
import { Subject } from 'rxjs'
import type { Failure } from '../../shared/failures.js'
import type { TransferEvent } from '../Domain/transfer-operation.js'
import type { TransferCancellation, TransferRuntimePort } from '../Application/ports.js'

export class NodeTransferRuntime implements TransferRuntimePort {
  private readonly events = new Subject<TransferEvent>()

  createId(): string {
    return randomUUID()
  }

  createCancellation(): TransferCancellation {
    const controller = new AbortController()
    return {
      signal: controller.signal,
      abort: (reason: Failure) => controller.abort(reason)
    }
  }

  schedule(callback: () => void, delayMs: number): unknown {
    return setTimeout(callback, delayMs)
  }

  cancelSchedule(handle: unknown): void {
    clearTimeout(handle as ReturnType<typeof setTimeout>)
  }

  publish(event: TransferEvent): void {
    this.events.next(event)
  }

  subscribe(listener: (event: TransferEvent) => void): () => void {
    const subscription = this.events.subscribe(listener)
    return () => subscription.unsubscribe()
  }
}
