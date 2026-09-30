import { Failure, type FailureKind } from '../../shared/failures.js'

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

export type ProgressUpdate = Partial<Pick<TransferState, 'current' | 'currentName' | 'phase' | 'bytesProcessed' | 'bytesTotal'>>

export class TransferOperation {
  private currentState: TransferState
  private terminal = false

  constructor(id: string, kind: TransferKind, total: number, destinationName?: string, bytesTotal: number | null = null) {
    this.currentState = {
      id,
      kind,
      current: 0,
      total,
      phase: 'preparing',
      bytesProcessed: 0,
      bytesTotal,
      status: 'running',
      ...(destinationName ? { destinationName } : {})
    }
  }

  static assertIdle(active: TransferOperation | undefined): void {
    if (active) throw new Failure('operation_busy', 'Another file operation is already running.')
  }

  get state(): TransferState {
    return this.currentState
  }

  progress(update: ProgressUpdate): { state: TransferState; immediate: boolean } | undefined {
    if (this.terminal) return
    const active = this.currentState
    const current = update.current === undefined ? active.current : Math.max(active.current, normalizeCount(update.current))
    const bytesProcessed = update.bytesProcessed === undefined ? active.bytesProcessed : Math.max(active.bytesProcessed, normalizeCount(update.bytesProcessed))
    const requestedTotal = 'bytesTotal' in update ? normalizeTotal(update.bytesTotal) : active.bytesTotal
    const stableTotal = active.bytesTotal === null && active.phase !== 'preparing' && requestedTotal !== null ? null : requestedTotal
    const bytesTotal = stableTotal !== null && stableTotal < bytesProcessed ? null : stableTotal
    const phase = update.phase ?? active.phase
    const currentName = update.currentName ?? active.currentName
    if (
      current === active.current &&
      currentName === active.currentName &&
      phase === active.phase &&
      bytesProcessed === active.bytesProcessed &&
      bytesTotal === active.bytesTotal
    )
      return

    this.currentState = { ...active, current, currentName, phase, bytesProcessed, bytesTotal }
    return {
      state: this.currentState,
      immediate: current !== active.current || currentName !== active.currentName || phase !== active.phase
    }
  }

  complete(): TransferEvent {
    this.assertRunning()
    this.terminal = true
    return { type: 'operation_completed', operationId: this.currentState.id }
  }

  fail(failure: Failure): TransferEvent {
    this.assertRunning()
    this.terminal = true
    return {
      type: 'operation_failed',
      operationId: this.currentState.id,
      failure: { kind: failure.kind, message: failure.message }
    }
  }

  private assertRunning(): void {
    if (this.terminal) throw new Failure('operation_busy', 'The transfer is no longer active.')
  }
}

function normalizeCount(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function normalizeTotal(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null
}
