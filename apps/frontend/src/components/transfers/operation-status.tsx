import type { TransferState } from '@raft/shared'
import { CancelTransferButton } from './cancel-transfer-button'
import { formatFileSize } from '../file-browser/file-browser-list'

interface OperationStatusProps {
  operation: TransferState | null
  isConnected: boolean
  notice: string
  uploadPending: boolean
  transferPendingKind?: 'copy' | 'move'
}

export function OperationStatus({ operation, isConnected, notice, uploadPending, transferPendingKind }: OperationStatusProps) {
  const transferPending = transferPendingKind !== undefined
  const percentage =
    operation?.bytesTotal && operation.bytesTotal > 0 ? Math.min(100, Math.floor((operation.bytesProcessed / operation.bytesTotal) * 100)) : undefined
  const byteLabel = operation ? getByteLabel(operation) : ''
  const phaseDescription = operation ? getPhaseDescription(getDisplayedPhase(operation)) : ''
  const announcement = operation ? phaseDescription : notice || getPendingDescription(uploadPending, transferPendingKind)

  return (
    <>
      <section
        aria-label="Operation status"
        className="file-browser__operation-area operation-status"
        hidden={!operation && !notice && !uploadPending && !transferPending}
      >
        {operation ? (
          <>
            <p className="operation-status__item">{getTransferDescription(operation)}</p>
            <p className="operation-status__phase">{phaseDescription}</p>
            {!isConnected ? <p className="operation-status__connection">Reconnecting…</p> : null}
            <progress aria-label={`${getOperationLabel(operation)} progress`} className="operation-status__progress" max={100} value={percentage} />
            {percentage === undefined ? null : <p className="operation-status__percentage">{percentage}%</p>}
            <p className="operation-status__bytes">
              {formatFileSize(operation.bytesProcessed)} {byteLabel} of{' '}
              {operation.bytesTotal === null ? 'unknown total' : `${formatFileSize(operation.bytesTotal)} total`}
            </p>
            <p className="operation-status__items">
              {operation.current} / {operation.total} items completed
            </p>
            {operation.kind === 'upload' || operation.kind === 'copy' ? (
              <CancelTransferButton isConnected={isConnected} key={operation.id} kind={operation.kind} operationId={operation.id} />
            ) : null}
          </>
        ) : null}
        {!operation && uploadPending ? <p>Starting upload…</p> : null}
        {!operation && transferPending ? <p>Starting {transferPendingKind}…</p> : null}
        {notice ? <p className="operation-status__notice">{notice}</p> : null}
      </section>
      <output aria-atomic="true" aria-live="polite" className="operation-status__announcer">
        {announcement}
      </output>
    </>
  )
}

function getPhaseDescription(phase: TransferState['phase']): string {
  if (phase === 'preparing') return 'Preparing…'
  if (phase === 'finalizing') return 'Finalizing…'
  return 'Transferring'
}

function getDisplayedPhase(operation: TransferState): TransferState['phase'] {
  if (operation.bytesTotal !== null && operation.bytesTotal > 0 && operation.bytesProcessed >= operation.bytesTotal) return 'finalizing'
  return operation.phase
}

function getByteLabel(operation: TransferState): string {
  if (operation.kind === 'upload') return 'uploaded'
  if (operation.kind === 'copy') return 'copied'
  return 'processed'
}

function getOperationLabel(operation: TransferState): string {
  if (operation.kind === 'upload') return 'Upload'
  if (operation.kind === 'copy') return 'Copy'
  return 'Move'
}

function getTransferDescription(operation: TransferState): string {
  if (operation.kind === 'upload') return `Uploading “${operation.currentName ?? 'items'}”`
  const action = operation.kind === 'move' ? 'Moving' : 'Copying'
  return `${action} “${operation.currentName ?? 'items'}” to ${operation.destinationName ?? 'destination'}`
}

function getPendingDescription(uploadPending: boolean, transferPendingKind?: 'copy' | 'move'): string {
  if (uploadPending) return 'Starting upload…'
  return transferPendingKind ? `Starting ${transferPendingKind}…` : ''
}
