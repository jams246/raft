'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'

interface DeleteConfirmationDialogProps {
  paths: string[]
  isLocked: boolean
  onClose: () => void
  onFinish: () => void
}

export function DeleteConfirmationDialog({ paths, isLocked, onClose, onFinish }: DeleteConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const itemLabel = paths.length === 1 ? 'item' : 'items'
  const dialogTitle = errorMessage ? 'Deletion failed' : `Delete ${paths.length} ${itemLabel}?`

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  async function deleteItems(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isLocked) return
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths })
      })
      if (!response.ok) {
        const apiError = (await response.json().catch(() => undefined)) as { message?: string } | undefined
        throw new Error(apiError?.message ?? 'Unable to delete selected items.')
      }
      dialogRef.current?.close()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete selected items.')
    } finally {
      setIsSubmitting(false)
      onFinish()
    }
  }

  return (
    <dialog
      aria-labelledby="delete-confirmation-title"
      className="delete-confirmation-dialog"
      onCancel={(event) => {
        if (isSubmitting) event.preventDefault()
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <h2 className="delete-confirmation-dialog__title" id="delete-confirmation-title">
        {dialogTitle}
      </h2>
      {errorMessage ? (
        <>
          <p role="alert">{errorMessage}</p>
          <div className="delete-confirmation-dialog__actions">
            <button onClick={() => dialogRef.current?.close()} type="button">
              Close
            </button>
          </div>
        </>
      ) : (
        <form className="delete-confirmation-dialog__form" onSubmit={(event) => void deleteItems(event)}>
          <p>This permanently deletes the selected files and folders.</p>
          <div className="delete-confirmation-dialog__actions">
            <button disabled={isSubmitting} onClick={() => dialogRef.current?.close()} type="button">
              Cancel
            </button>
            <button className="delete-confirmation-dialog__confirm--destructive" disabled={isSubmitting || isLocked} type="submit">
              {isSubmitting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
