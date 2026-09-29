'use client'

import type { ConflictPolicy, CopyConflict } from '@raft/shared'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface CopyWorkflowProps {
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
  const [conflicts, setConflicts] = useState<CopyConflict[]>()
  const [policy, setPolicy] = useState<ConflictPolicy>('rename')
  const [isChecking, setIsChecking] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const preflightController = useRef<AbortController | undefined>(undefined)
  const requestStarted = useRef(false)
  const operationLocked = useRef(isOperationLocked)

  useLayoutEffect(() => {
    operationLocked.current = isOperationLocked
  }, [isOperationLocked])

  const startTransfer = useCallback(
    async (conflictPolicy: ConflictPolicy) => {
      if (operationLocked.current || requestStarted.current) return
      requestStarted.current = true
      const controller = new AbortController()
      onRequestStarted(kind, controller)
      try {
        const response = await fetch(`/api/${kind}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ sources: sourcePaths, destination: destinationPath, conflictPolicy })
        })
        if (!response.ok) throw new Error(await getResponseMessage(response, `Unable to ${kind} selected items.`))
        onRequestFinished(controller)
      } catch (error) {
        onRequestFinished(controller, error instanceof Error ? error.message : `Unable to ${kind} selected items.`)
      }
    },
    [destinationPath, kind, onRequestFinished, onRequestStarted, sourcePaths]
  )

  const checkConflicts = useCallback(async () => {
    if (operationLocked.current || preflightController.current || requestStarted.current) return
    const controller = new AbortController()
    preflightController.current = controller
    setIsChecking(true)
    setErrorMessage('')
    try {
      const response = await fetch(`/api/${kind}/preflight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: sourcePaths, destination: destinationPath }),
        signal: controller.signal
      })
      if (!response.ok) throw new Error(await getResponseMessage(response, `Unable to check ${kind} conflicts.`))
      const result = (await response.json()) as { conflicts: CopyConflict[] }
      if (controller.signal.aborted) return
      setConflicts(result.conflicts)
      if (result.conflicts.length === 0) await startTransfer('rename')
    } catch (error) {
      if (!controller.signal.aborted) setErrorMessage(error instanceof Error ? error.message : `Unable to check ${kind} conflicts.`)
    } finally {
      if (preflightController.current === controller) {
        if (!controller.signal.aborted && !requestStarted.current) setIsChecking(false)
        preflightController.current = undefined
      }
    }
  }, [kind, destinationPath, sourcePaths, startTransfer])

  useEffect(() => {
    let startCheckTimer: number | undefined
    if (!chooseDestination) {
      dialogRef.current?.showModal()
      startCheckTimer = window.setTimeout(() => void checkConflicts(), 0)
    }
    return () => {
      if (startCheckTimer !== undefined) window.clearTimeout(startCheckTimer)
      if (!requestStarted.current) preflightController.current?.abort()
    }
  }, [checkConflicts, chooseDestination])

  function copyHere() {
    if (conflicts) void startTransfer(policy)
    else void checkConflicts()
  }

  const conflictTitle = `${conflicts?.length ?? 0} naming conflict${conflicts?.length === 1 ? '' : 's'}`
  const conflictControls =
    conflicts && conflicts.length > 0 ? (
      <>
        <p>{conflictTitle}</p>
        <ul className="copy-workflow__conflicts">
          {conflicts.map((conflict) => (
            <li key={conflict.source}>
              <span>{conflict.existingName}</span> → <span>{conflict.suggestedName}</span>
            </li>
          ))}
        </ul>
        <fieldset className="copy-workflow__policies" disabled={isOperationLocked}>
          <legend>Choose how to resolve all conflicts</legend>
          <label>
            <input checked={policy === 'rename'} name="copy-policy" onChange={() => setPolicy('rename')} type="radio" value="rename" />
            Rename incoming items
          </label>
          <label>
            <input checked={policy === 'overwrite'} name="copy-policy" onChange={() => setPolicy('overwrite')} type="radio" value="overwrite" />
            Overwrite existing items
          </label>
        </fieldset>
      </>
    ) : null

  if (!chooseDestination) {
    return (
      <dialog
        aria-labelledby="copy-workflow-title"
        className="copy-workflow__dialog"
        onCancel={(event) => {
          event.preventDefault()
          onCancel()
        }}
        ref={dialogRef}
      >
        <h2 id="copy-workflow-title">{actionLabel}</h2>
        {isChecking && !conflicts ? <p aria-live="polite">Checking {kind} conflicts…</p> : null}
        {conflictControls}
        {errorMessage ? <p role="alert">{errorMessage}</p> : null}
        <div className="copy-workflow__actions">
          <button onClick={onCancel} type="button">
            Cancel
          </button>
          {conflicts ? (
            <button disabled={isOperationLocked} onClick={copyHere} type="button">
              {actionLabel}
            </button>
          ) : null}
          {errorMessage ? (
            <button disabled={isChecking || isOperationLocked} onClick={() => void checkConflicts()} type="button">
              Try checking again
            </button>
          ) : null}
        </div>
      </dialog>
    )
  }

  return (
    <section aria-label={`${actionLabel} controls`} className="copy-workflow">
      {isChecking ? <p aria-live="polite">Checking {kind} conflicts…</p> : null}
      {destinationPath === '/' ? <p>Choose a folder under My Files to {kind} into.</p> : null}
      {conflictControls}
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      <div className="copy-workflow__actions">
        <button onClick={onCancel} type="button">
          Cancel
        </button>
        <button disabled={isChecking || isOperationLocked || destinationPath === '/'} onClick={copyHere} type="button">
          {conflicts ? actionLabel : `${actionLabel} Here`}
        </button>
        {errorMessage ? (
          <button disabled={isChecking || isOperationLocked} onClick={() => void checkConflicts()} type="button">
            Try checking again
          </button>
        ) : null}
      </div>
    </section>
  )
}

async function getResponseMessage(response: Response, fallback: string): Promise<string> {
  const error = (await response.json().catch(() => undefined)) as { message?: string } | undefined
  return error?.message ?? fallback
}
