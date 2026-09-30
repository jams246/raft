'use client'

import type { UploadConflict, UploadConflictPolicy } from '@raft/shared'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createUploadFormData, type UploadSelection } from './file-browser-upload'

interface UploadDialogProps {
  directory: string
  selection: UploadSelection
  isOperationLocked: boolean
  onClose: () => void
  onRequestStarted: (controller: AbortController) => void
  onRequestFinished: (controller: AbortController, error?: string) => void
}

export function UploadDialog({ directory, selection, isOperationLocked, onClose, onRequestStarted, onRequestFinished }: UploadDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const mounted = useRef(true)
  const operationLocked = useRef(isOperationLocked)
  const requestStarted = useRef(false)
  const [conflicts, setConflicts] = useState<UploadConflict[]>()
  const [policy, setPolicy] = useState<UploadConflictPolicy>('rename')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [canRetryCheck, setCanRetryCheck] = useState(true)
  const [checkRevision, setCheckRevision] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const isChecking = conflicts === undefined && !errorMessage

  useLayoutEffect(() => {
    operationLocked.current = isOperationLocked
  }, [isOperationLocked])

  const sendUpload = useCallback(
    async (uploadPolicy: UploadConflictPolicy) => {
      if (operationLocked.current || requestStarted.current) return
      const bytesTotal = selection.files.reduce((total, file) => total + file.size, 0)
      if (!Number.isSafeInteger(bytesTotal) || bytesTotal < 0) {
        setCanRetryCheck(false)
        setErrorMessage('The selected files exceed the supported upload size.')
        return
      }
      requestStarted.current = true
      const controller = new AbortController()
      setIsSubmitting(true)
      setErrorMessage('')
      try {
        const query = new URLSearchParams({ directory, total: String(selection.manifest.items.length), policy: uploadPolicy })
        query.set('bytesTotal', String(bytesTotal))
        const request = fetch(`/api/upload?${query}`, { method: 'POST', body: createUploadFormData(selection), signal: controller.signal })
        onRequestStarted(controller)
        dialogRef.current?.close()
        const response = await request
        if (!response.ok) throw new Error(await getResponseMessage(response, 'Unable to upload selected items.'))
        onRequestFinished(controller)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to upload selected items.'
        onRequestFinished(controller, message)
      } finally {
        if (mounted.current) setIsSubmitting(false)
      }
    },
    [directory, onRequestFinished, onRequestStarted, selection]
  )

  useEffect(() => {
    const abortController = new AbortController()
    mounted.current = true
    dialogRef.current?.showModal()

    async function checkConflicts() {
      try {
        const response = await fetch('/api/upload/preflight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ directory, manifest: selection.manifest }),
          signal: abortController.signal
        })
        if (!response.ok) throw new Error(await getResponseMessage(response, 'Unable to check upload names.'))
        const result = (await response.json()) as { conflicts: UploadConflict[] }
        if (abortController.signal.aborted) return
        setConflicts(result.conflicts)
        if (result.conflicts.length === 0) void sendUpload('rename')
      } catch (error) {
        if (!abortController.signal.aborted && mounted.current) setErrorMessage(error instanceof Error ? error.message : 'Unable to check upload names.')
      }
    }

    void checkConflicts()
    return () => {
      mounted.current = false
      abortController.abort()
    }
  }, [checkRevision, directory, selection, sendUpload])

  const conflictTitle = `${conflicts?.length ?? 0} naming conflict${conflicts?.length === 1 ? '' : 's'}`

  return (
    <dialog
      aria-labelledby="upload-title"
      className="upload-dialog"
      onCancel={(event) => {
        if (isSubmitting) event.preventDefault()
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <h2 className="upload-dialog__title" id="upload-title">
        Upload
      </h2>
      {isChecking ? <p aria-live="polite">Checking upload names…</p> : null}
      {conflicts && conflicts.length > 0 ? (
        <>
          <p>{conflictTitle}</p>
          <ul className="upload-dialog__conflicts">
            {conflicts.map((conflict) => (
              <li key={conflict.name}>
                <span>{conflict.name}</span> → <span>{conflict.suggestedName}</span>
              </li>
            ))}
          </ul>
          <fieldset className="upload-dialog__policies" disabled={isSubmitting || isOperationLocked}>
            <legend>Choose how to resolve all conflicts</legend>
            <label>
              <input checked={policy === 'rename'} name="upload-policy" onChange={() => setPolicy('rename')} type="radio" value="rename" />
              Rename incoming items
            </label>
            <label>
              <input checked={policy === 'overwrite'} name="upload-policy" onChange={() => setPolicy('overwrite')} type="radio" value="overwrite" />
              Overwrite existing items
            </label>
          </fieldset>
        </>
      ) : null}
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      <div className="upload-dialog__actions">
        <button disabled={isSubmitting} onClick={() => dialogRef.current?.close()} type="button">
          Cancel
        </button>
        {conflicts ? (
          <button disabled={isSubmitting || isOperationLocked || !canRetryCheck} onClick={() => void sendUpload(policy)} type="button">
            {isSubmitting ? 'Uploading…' : 'Upload'}
          </button>
        ) : null}
        {errorMessage && canRetryCheck ? (
          <button
            disabled={isSubmitting || isChecking || isOperationLocked}
            onClick={() => {
              setErrorMessage('')
              setCheckRevision((revision) => revision + 1)
            }}
            type="button"
          >
            Try checking again
          </button>
        ) : null}
      </div>
    </dialog>
  )
}

async function getResponseMessage(response: Response, fallback: string): Promise<string> {
  const error = (await response.json().catch(() => undefined)) as { message?: string } | undefined
  return error?.message ?? fallback
}
