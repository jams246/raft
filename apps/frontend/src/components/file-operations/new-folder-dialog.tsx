'use client'

import { type SubmitEvent, useCallback, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { OperationDialogContent } from './operation-dialog-content'
import { postFileOperation } from './post-file-operation'
import { useOperationDialogOpenChange } from './use-operation-dialog-open-change'

interface NewFolderDialogProps {
  parentPath: string
  isLocked: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: () => void
}

export function NewFolderDialog({ parentPath, isLocked, open, onOpenChange, onCloseAutoFocus }: NewFolderDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const resetForm = useCallback(() => {
    setName('')
    setErrorMessage('')
  }, [])
  const changeOpen = useOperationDialogOpenChange(isSubmitting, onOpenChange, resetForm)

  async function createFolder(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isLocked) return
    setIsSubmitting(true)
    setErrorMessage('')

    try {
      await postFileOperation('/api/directory', { parent: parentPath, name }, 'Unable to create folder.')
      resetForm()
      onOpenChange(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create folder.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <OperationDialogContent
        aria-describedby="new-folder-description"
        className="max-h-[85dvh] overflow-auto"
        isSubmitting={isSubmitting}
        onReturnFocus={onCloseAutoFocus}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <DialogHeader className="text-left">
          <DialogTitle>New Folder</DialogTitle>
        </DialogHeader>
        <p className="m-0 text-sm text-muted-foreground" id="new-folder-description">
          Create a folder inside this location.
        </p>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            void createFolder(event)
          }}
        >
          <Label htmlFor="new-folder-name">Folder name</Label>
          <Input
            disabled={isSubmitting || isLocked}
            id="new-folder-name"
            onChange={(event) => setName(event.target.value)}
            placeholder="Documentaries"
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
            <Button disabled={isSubmitting || isLocked} type="submit">
              {isSubmitting ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </OperationDialogContent>
    </Dialog>
  )
}
