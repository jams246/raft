'use client'

import type { FileEntry } from '@raft/shared'
import { type SubmitEvent, useCallback, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { OperationDialogContent } from './operation-dialog-content'
import { postFileOperation } from './post-file-operation'
import { useOperationDialogOpenChange } from './use-operation-dialog-open-change'

interface RenameDialogProps {
  item?: FileEntry | undefined
  isLocked: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: () => void
  onSuccess: () => void
}

export function RenameDialog({ item, isLocked, open, onOpenChange, onCloseAutoFocus, onSuccess }: RenameDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState({ item, name: item?.name ?? '' })
  const name = draft.item === item ? draft.name : (item?.name ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const extensionStart = item?.type === 'file' ? item.name.lastIndexOf('.') : -1
  const selectionEnd = extensionStart > 0 ? extensionStart : (item?.name.length ?? 0)

  const resetForm = useCallback(() => {
    setDraft({ item: undefined, name: '' })
    setErrorMessage('')
  }, [])
  const changeOpen = useOperationDialogOpenChange(isSubmitting, onOpenChange, resetForm)

  async function renameItem(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isLocked || !item) return
    setIsSubmitting(true)
    setErrorMessage('')

    try {
      await postFileOperation('/api/rename', { path: item.path, name }, 'Unable to rename item.')
      resetForm()
      onOpenChange(false)
      window.requestAnimationFrame(onSuccess)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to rename item.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <OperationDialogContent
        aria-describedby="rename-description"
        className="max-h-[85dvh] overflow-auto"
        isSubmitting={isSubmitting}
        onReturnFocus={onCloseAutoFocus}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
          inputRef.current?.setSelectionRange(0, selectionEnd)
        }}
      >
        <DialogHeader className="text-left">
          <DialogTitle>Rename</DialogTitle>
        </DialogHeader>
        <p className="m-0 text-sm text-muted-foreground" id="rename-description">
          Enter a new name for this item.
        </p>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            void renameItem(event)
          }}
        >
          <Label htmlFor="rename-name">Name</Label>
          <Input
            disabled={isSubmitting || isLocked}
            id="rename-name"
            onChange={(event) => setDraft({ item, name: event.target.value })}
            ref={inputRef}
            required
            value={name}
          />
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter className="mt-2 flex-row justify-end">
            <Button disabled={isSubmitting} onClick={() => changeOpen(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={isSubmitting || isLocked || !item} type="submit">
              {isSubmitting ? 'Renaming…' : 'Rename'}
            </Button>
          </DialogFooter>
        </form>
      </OperationDialogContent>
    </Dialog>
  )
}
