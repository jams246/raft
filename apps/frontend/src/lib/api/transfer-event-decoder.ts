import type { TransferEvent, TransferKind, TransferState } from '@raft/shared'
import { isApiErrorCode } from './api-error'
import { type UnknownRecord, isMemberOf, isNonNegativeNumber, isRecord } from './validation'

const isTransferKind = isMemberOf<TransferKind>({ upload: true, copy: true, move: true })
const isTransferPhase = isMemberOf<TransferState['phase']>({ preparing: true, transferring: true, finalizing: true })

function decodeTransferState(value: unknown): TransferState | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !isTransferKind(value.kind) ||
    !isNonNegativeNumber(value.current) ||
    !isNonNegativeNumber(value.total) ||
    !isTransferPhase(value.phase) ||
    !isNonNegativeNumber(value.bytesProcessed) ||
    (value.bytesTotal !== null && !isNonNegativeNumber(value.bytesTotal)) ||
    value.status !== 'running'
  ) {
    return undefined
  }
  const { currentName, destinationName } = value
  if ((currentName !== undefined && typeof currentName !== 'string') || (destinationName !== undefined && typeof destinationName !== 'string')) return undefined
  return {
    id: value.id,
    kind: value.kind,
    current: value.current,
    total: value.total,
    phase: value.phase,
    bytesProcessed: value.bytesProcessed,
    bytesTotal: value.bytesTotal,
    status: 'running',
    ...(currentName === undefined ? {} : { currentName }),
    ...(destinationName === undefined ? {} : { destinationName })
  }
}

function decodeOperationEvent(type: 'operation_started' | 'operation_progress', value: UnknownRecord): TransferEvent | undefined {
  const operation = decodeTransferState(value.operation)
  return operation === undefined ? undefined : { type, operation }
}

/**
 * Decodes one server-sent event payload.
 *
 * @param data - The raw `data` field of an SSE message.
 * @returns The event, or undefined for malformed JSON, an invalid payload, or an event type this client does not know.
 *   Unknown types are ignored so a newer server can add events without breaking older clients.
 */
export function decodeTransferEvent(data: string): TransferEvent | undefined {
  let value: unknown
  try {
    value = JSON.parse(data)
  } catch {
    return undefined
  }
  if (!isRecord(value)) return undefined

  switch (value.type) {
    case 'operation_state': {
      if (value.operation === null) return { type: 'operation_state', operation: null }
      const operation = decodeTransferState(value.operation)
      return operation === undefined ? undefined : { type: 'operation_state', operation }
    }
    case 'operation_started':
    case 'operation_progress':
      return decodeOperationEvent(value.type, value)
    case 'operation_completed':
      return typeof value.operationId === 'string' ? { type: 'operation_completed', operationId: value.operationId } : undefined
    case 'operation_failed':
      if (typeof value.operationId !== 'string' || !isApiErrorCode(value.error) || typeof value.message !== 'string') return undefined
      return { type: 'operation_failed', operationId: value.operationId, error: value.error, message: value.message }
    case 'directory_changed':
      return typeof value.path === 'string' ? { type: 'directory_changed', path: value.path } : undefined
    default:
      return undefined
  }
}
