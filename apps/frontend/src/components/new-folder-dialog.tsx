'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'

interface NewFolderDialogProps {
  parentPath: string
  isLocked: boolean
  onClose: () => void
  onRefresh: () => void
}

export function NewFolderDialog({ parentPath, isLocked, onClose, onRefresh }: NewFolderDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isLocked) return
    setIsSubmitting(true)
    setErrorMessage('')

    try {
      const response = await fetch('/api/directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent: parentPath, name })
      })
      if (!response.ok) {
        const result = (await response.json().catch(() => undefined)) as { message?: string } | undefined
        throw new Error(result?.message ?? 'Unable to create folder.')
      }
      dialogRef.current?.close()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create folder.')
    } finally {
      setIsSubmitting(false)
      onRefresh()
    }
  }

  return (
    <dialog
      aria-labelledby="new-folder-title"
      className="new-folder-dialog"
      onCancel={(event) => {
        if (isSubmitting) event.preventDefault()
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <h2 className="new-folder-dialog__title" id="new-folder-title">
        New Folder
      </h2>
      <form className="new-folder-dialog__form" onSubmit={(event) => void createFolder(event)}>
        <label htmlFor="new-folder-name">Folder name</label>
        <input
          autoFocus
          disabled={isSubmitting || isLocked}
          id="new-folder-name"
          onChange={(event) => setName(event.target.value)}
          placeholder="Documentaries"
          required
          value={name}
        />
        {errorMessage ? <p role="alert">{errorMessage}</p> : null}
        <div className="new-folder-dialog__actions">
          <button disabled={isSubmitting} onClick={() => dialogRef.current?.close()} type="button">
            Cancel
          </button>
          <button disabled={isSubmitting || isLocked} type="submit">
            {isSubmitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
