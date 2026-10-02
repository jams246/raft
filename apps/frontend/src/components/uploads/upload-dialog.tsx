'use client'

import type { UploadConflict, UploadConflictPolicy } from '@raft/shared'
import { useEffect, useRef, useState } from 'react'
import type { UploadSelection } from './file-browser-upload'
import { TransferConflicts } from '../transfers/transfer-conflicts'
import { checkUploadConflicts } from '../transfers/transfer-requests'
import { useUploadRequest } from './use-upload-request'

export interface UploadDialogProps {
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
  const [conflicts, setConflicts] = useState<UploadConflict[]>()
  const [policy, setPolicy] = useState<UploadConflictPolicy>('rename')
  const [checkRevision, setCheckRevision] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const isChecking = conflicts === undefined && !errorMessage

  const { sendUpload, isSubmitting, canRetryCheck } = useUploadRequest({
    directory,
    selection,
    isOperationLocked,
    onRequestStarted,
    onRequestFinished,
    dialogRef,
    mounted,
    onError: setErrorMessage
  })

  useEffect(() => {
    const abortController = new AbortController()
    mounted.current = true
    dialogRef.current?.showModal()

    async function checkConflicts() {
      try {
        const checkedConflicts = await checkUploadConflicts(directory, selection, abortController.signal)
        if (abortController.signal.aborted) return
        setConflicts(checkedConflicts)
        if (checkedConflicts.length === 0) void sendUpload('rename')
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
      <TransferConflicts kind="upload" conflicts={conflicts} policy={policy} disabled={isSubmitting || isOperationLocked} onPolicyChange={setPolicy} />
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
