'use client'

import type { ConflictPolicy } from '@raft/shared'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { TransferConflicts } from './transfer-conflicts'
import { startCopyTransfer } from './transfer-requests'
import { useCopyPreflight } from './use-copy-preflight'

export interface CopyWorkflowProps {
  kind: 'copy' | 'move'
  sourcePaths: string[]
  destinationPath: string
  chooseDestination: boolean
  isOperationLocked: boolean
  onCancel: () => void
  onRequestStarted: (kind: 'copy' | 'move', controller: AbortController) => void
  onRequestFinished: (controller: AbortController, error?: string) => void
}

export function CopyWorkflow({
  kind,
  sourcePaths,
  destinationPath,
  chooseDestination,
  isOperationLocked,
  onCancel,
  onRequestStarted,
  onRequestFinished
}: CopyWorkflowProps) {
  const actionLabel = kind === 'move' ? 'Move' : 'Copy'
  const [policy, setPolicy] = useState<ConflictPolicy>('rename')
  const requestStarted = useRef(false)
  const operationLocked = useRef(isOperationLocked)

  useLayoutEffect(() => {
    operationLocked.current = isOperationLocked
  }, [isOperationLocked])

  const canStartTransfer = useCallback(() => !operationLocked.current && !requestStarted.current, [])
  const hasRequestStarted = useCallback(() => requestStarted.current, [])

  const startTransfer = useCallback(
    async (conflictPolicy: ConflictPolicy) => {
      if (!canStartTransfer()) return
      requestStarted.current = true
      const controller = new AbortController()
      onRequestStarted(kind, controller)
      try {
        await startCopyTransfer(kind, sourcePaths, destinationPath, conflictPolicy, controller.signal)
        onRequestFinished(controller)
      } catch (error) {
        onRequestFinished(controller, error instanceof Error ? error.message : `Unable to ${kind} selected items.`)
      }
    },
    [destinationPath, kind, onRequestFinished, onRequestStarted, sourcePaths, canStartTransfer]
  )

  const { conflicts, isChecking, errorMessage, checkConflicts } = useCopyPreflight({
    kind,
    sourcePaths,
    destinationPath,
    chooseDestination,
    canStartTransfer,
    hasRequestStarted,
    onStartTransfer: startTransfer
  })

  function copyHere() {
    if (conflicts) void startTransfer(policy)
    else void checkConflicts()
  }

  return (
    <section aria-label={`${actionLabel} controls`} className="copy-workflow">
      {isChecking ? <p aria-live="polite">Checking {kind} conflicts…</p> : null}
      {destinationPath === '/' ? <p>Choose a folder under My Files to {kind} into.</p> : null}
      <TransferConflicts kind="copy" conflicts={conflicts} policy={policy} disabled={isOperationLocked} onPolicyChange={setPolicy} />
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      <div className="copy-workflow__actions">
        <button onClick={onCancel} type="button">
          Cancel
        </button>
        {chooseDestination || conflicts ? (
          <button disabled={isChecking || isOperationLocked || destinationPath === '/'} onClick={copyHere} type="button">
            {conflicts ? actionLabel : `${actionLabel} Here`}
          </button>
        ) : null}
        {errorMessage ? (
          <button
            disabled={isChecking || isOperationLocked}
            onClick={() => {
              void checkConflicts()
            }}
            type="button"
          >
            Try checking again
          </button>
        ) : null}
      </div>
    </section>
  )
}
