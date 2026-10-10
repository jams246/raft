import type { TransferState } from '@raft/shared'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { CancelTransferButton } from './cancel-transfer-button'
import { formatFileSize } from '../file-browser/file-browser-list'

const PERCENTAGE_TOTAL = 100

interface OperationStatusProps {
  operation: TransferState | null
  isConnected: boolean
  notice: string
  uploadPending: boolean
  transferPendingKind?: 'copy' | 'move' | undefined
}

export function OperationStatus({ operation, isConnected, notice, uploadPending, transferPendingKind }: OperationStatusProps) {
  const transferPending = transferPendingKind !== undefined
  const percentage =
    operation?.bytesTotal && operation.bytesTotal > 0
      ? Math.min(PERCENTAGE_TOTAL, Math.floor((operation.bytesProcessed / operation.bytesTotal) * PERCENTAGE_TOTAL))
      : undefined
  const byteLabel = operation ? getByteLabel(operation) : ''
  const phaseDescription = operation ? getPhaseDescription(getDisplayedPhase(operation)) : ''
  const announcement = operation ? phaseDescription : notice || getPendingDescription(uploadPending, transferPendingKind)

  return (
    <>
      {operation || notice || uploadPending || transferPending ? (
        <Card className="mx-4 my-3 max-h-[40dvh] overflow-auto wrap-anywhere border border-border bg-secondary">
          <CardContent className="p-3">
            <section aria-label="Operation status" className="grid gap-1 p-3">
              {operation ? (
                <>
                  <p className="operation-status__item">{getTransferDescription(operation)}</p>
                  <p className="operation-status__phase">{phaseDescription}</p>
                  {!isConnected ? <p className="operation-status__connection">Reconnecting…</p> : null}
                  <Progress aria-label={`${getOperationLabel(operation)} progress`} max={PERCENTAGE_TOTAL} value={percentage} />
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
          </CardContent>
        </Card>
      ) : null}
      <output aria-atomic="true" aria-live="polite" className="sr-only">
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
