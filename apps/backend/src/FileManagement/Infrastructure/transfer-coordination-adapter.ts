import type { TransferCoordinator, TransferEvent, TransferState } from '../../contracts/transfer-coordination.js'
import type { OperationEvent, TransferCoordinationPort, TransferProgress, TransferReservation, TransferSnapshot } from '../Application/ports.js'

export class TransferCoordinationAdapter implements TransferCoordinationPort {
  constructor(private readonly transfers: TransferCoordinator) {}

  getSnapshot(): TransferSnapshot | null {
    const state = this.transfers.getSnapshot()
    return state ? toSnapshot(state) : null
  }

  subscribe(listener: (event: OperationEvent) => void): () => void {
    return this.transfers.subscribe((event) => listener(toOperationEvent(event)))
  }

  reserveUpload(total: number, bytesTotal: number): TransferReservation {
    return this.reservation(this.transfers.reserveUpload(total, bytesTotal).id)
  }

  reserveCopy(total: number, destinationName: string): TransferReservation {
    return this.reservation(this.transfers.reserveCopy(total, destinationName).id)
  }

  reserveMove(total: number, destinationName: string): TransferReservation {
    return this.reservation(this.transfers.reserveMove(total, destinationName).id)
  }

  assertIdle(): void {
    this.transfers.assertIdle()
  }

  assertActive(id: string): void {
    this.transfers.assertActive(id)
  }

  progress(id: string, update: TransferProgress): void {
    this.transfers.progress(id, update)
  }

  complete(id: string): void {
    this.transfers.complete(id)
  }

  fail(id: string, error: unknown): void {
    this.transfers.fail(id, error)
  }

  private reservation(id: string): TransferReservation {
    return { id, signal: this.transfers.getSignal(id) }
  }
}

function toSnapshot(state: TransferState): TransferSnapshot {
  return { ...state }
}

function toOperationEvent(event: TransferEvent): OperationEvent {
  if (event.type === 'operation_state') {
    return { type: event.type, operation: event.operation ? toSnapshot(event.operation) : null }
  }
  if (event.type === 'operation_started' || event.type === 'operation_progress') return { type: event.type, operation: toSnapshot(event.operation) }
  return { ...event }
}
