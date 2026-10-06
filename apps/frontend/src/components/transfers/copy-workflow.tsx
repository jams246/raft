'use client'

import type { ConflictPolicy } from '@raft/shared'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
    <Card className="mx-4 my-3 max-h-[40dvh] overflow-auto wrap-anywhere border border-border bg-card">
      <CardContent className="grid gap-3 p-4">
        <section aria-label={`${actionLabel} controls`} className="grid gap-3">
          {isChecking ? (
            <p aria-live="polite" className="m-0">
              Checking {kind} conflicts…
            </p>
          ) : null}
          {destinationPath === '/' ? <p className="m-0">Choose a folder under My Files to {kind} into.</p> : null}
          <TransferConflicts kind="copy" conflicts={conflicts} policy={policy} disabled={isOperationLocked} onPolicyChange={setPolicy} />
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={onCancel} type="button" variant="outline">
              Cancel
            </Button>
            {chooseDestination || conflicts ? (
              <Button disabled={isChecking || isOperationLocked || destinationPath === '/'} onClick={copyHere} type="button">
                {conflicts ? actionLabel : `${actionLabel} Here`}
              </Button>
            ) : null}
            {errorMessage ? (
              <Button
                disabled={isChecking || isOperationLocked}
                onClick={() => {
                  void checkConflicts()
                }}
                type="button"
                variant="outline"
              >
                Try checking again
              </Button>
            ) : null}
          </div>
        </section>
      </CardContent>
    </Card>
  )
}
