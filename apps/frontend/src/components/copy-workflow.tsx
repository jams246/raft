'use client'

import type { ConflictPolicy, CopyConflict } from '@raft/shared'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface CopyWorkflowProps {
  sourcePaths: string[]
  destinationPath: string
  chooseDestination: boolean
  isOperationLocked: boolean
  onCancel: () => void
  onRequestStarted: (controller: AbortController) => void
  onRequestFinished: (controller: AbortController, error?: string) => void
}

export function CopyWorkflow({
  sourcePaths,
  destinationPath,
  chooseDestination,
  isOperationLocked,
  onCancel,
  onRequestStarted,
  onRequestFinished
}: CopyWorkflowProps) {
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

  const startCopy = useCallback(
    async (conflictPolicy: ConflictPolicy) => {
      if (operationLocked.current || requestStarted.current) return
      requestStarted.current = true
      const controller = new AbortController()
      onRequestStarted(controller)
      try {
        const response = await fetch('/api/copy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ sources: sourcePaths, destination: destinationPath, conflictPolicy })
        })
        if (!response.ok) throw new Error(await getResponseMessage(response, 'Unable to copy selected items.'))
        onRequestFinished(controller)
      } catch (error) {
        onRequestFinished(controller, error instanceof Error ? error.message : 'Unable to copy selected items.')
      }
    },
    [destinationPath, onRequestFinished, onRequestStarted, sourcePaths]
  )

  const checkConflicts = useCallback(async () => {
    if (operationLocked.current || preflightController.current || requestStarted.current) return
    const controller = new AbortController()
    preflightController.current = controller
    setIsChecking(true)
    setErrorMessage('')
    try {
      const response = await fetch('/api/copy/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: sourcePaths, destination: destinationPath }),
        signal: controller.signal
      })
      if (!response.ok) throw new Error(await getResponseMessage(response, 'Unable to check copy conflicts.'))
      const result = (await response.json()) as { conflicts: CopyConflict[] }
      if (controller.signal.aborted) return
      setConflicts(result.conflicts)
      if (result.conflicts.length === 0) await startCopy('rename')
    } catch (error) {
      if (!controller.signal.aborted) setErrorMessage(error instanceof Error ? error.message : 'Unable to check copy conflicts.')
    } finally {
      if (preflightController.current === controller) {
        if (!controller.signal.aborted && !requestStarted.current) setIsChecking(false)
        preflightController.current = undefined
      }
    }
  }, [destinationPath, sourcePaths, startCopy])

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
    if (conflicts) void startCopy(policy)
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
        <h2 id="copy-workflow-title">Copy</h2>
        {isChecking && !conflicts ? <p aria-live="polite">Checking copy conflicts…</p> : null}
        {conflictControls}
        {errorMessage ? <p role="alert">{errorMessage}</p> : null}
        <div className="copy-workflow__actions">
          <button onClick={onCancel} type="button">
            Cancel
          </button>
          {conflicts ? (
            <button disabled={isOperationLocked} onClick={copyHere} type="button">
              Copy
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
    <section aria-label="Copy controls" className="copy-workflow">
      {isChecking ? <p aria-live="polite">Checking copy conflicts…</p> : null}
      {destinationPath === '/' ? <p>Choose a folder under My Files to copy into.</p> : null}
      {conflictControls}
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      <div className="copy-workflow__actions">
        <button onClick={onCancel} type="button">
          Cancel
        </button>
        <button disabled={isChecking || isOperationLocked || destinationPath === '/'} onClick={copyHere} type="button">
          {conflicts ? 'Copy' : 'Copy Here'}
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
