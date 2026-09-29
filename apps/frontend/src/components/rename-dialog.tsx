'use client'

import type { FileEntry } from '@raft/shared'
import { useEffect, useRef, useState, type FormEvent } from 'react'

interface RenameDialogProps {
  item: FileEntry
  isLocked: boolean
  onClose: () => void
  onSuccess: () => void
}

export function RenameDialog({ item, isLocked, onClose, onSuccess }: RenameDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(item.name)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const extensionStart = item.type === 'file' ? item.name.lastIndexOf('.') : -1
  const selectionEnd = extensionStart > 0 ? extensionStart : item.name.length

  useEffect(() => {
    dialogRef.current?.showModal()
    inputRef.current?.setSelectionRange(0, selectionEnd)
  }, [selectionEnd])

  async function renameItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isLocked) return
    setIsSubmitting(true)
    setErrorMessage('')

    try {
      const response = await fetch('/api/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: item.path, name })
      })
      if (!response.ok) {
        const result = (await response.json().catch(() => undefined)) as { message?: string } | undefined
        throw new Error(result?.message ?? 'Unable to rename item.')
      }
      onSuccess()
      dialogRef.current?.close()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to rename item.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <dialog
      aria-labelledby="rename-title"
      className="rename-dialog"
      onCancel={(event) => {
        if (isSubmitting) event.preventDefault()
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <h2 className="rename-dialog__title" id="rename-title">
        Rename
      </h2>
      <form className="rename-dialog__form" onSubmit={(event) => void renameItem(event)}>
        <label htmlFor="rename-name">Name</label>
        <input
          autoFocus
          disabled={isSubmitting || isLocked}
          id="rename-name"
          onChange={(event) => setName(event.target.value)}
          ref={inputRef}
          required
          value={name}
        />
        {errorMessage ? <p role="alert">{errorMessage}</p> : null}
        <div className="rename-dialog__actions">
          <button disabled={isSubmitting} onClick={() => dialogRef.current?.close()} type="button">
            Cancel
          </button>
          <button disabled={isSubmitting || isLocked} type="submit">
            {isSubmitting ? 'Renaming…' : 'Rename'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
