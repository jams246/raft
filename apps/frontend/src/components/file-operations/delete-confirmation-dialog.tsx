'use client'

import { type SubmitEvent, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { postFileOperation } from './post-file-operation'

interface DeleteConfirmationDialogProps {
  paths: string[]
  isLocked: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: () => void
  onFinish: () => void
}

export function DeleteConfirmationDialog({ paths, isLocked, open, onOpenChange, onCloseAutoFocus, onFinish }: DeleteConfirmationDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const itemLabel = paths.length === 1 ? 'item' : 'items'
  const dialogTitle = errorMessage ? 'Deletion failed' : `Delete ${paths.length} ${itemLabel}?`

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && isSubmitting) return
    if (!nextOpen) setErrorMessage('')
    onOpenChange(nextOpen)
  }

  async function deleteItems(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isLocked) return
    setIsSubmitting(true)

    let succeeded = false
    try {
      await postFileOperation('/api/delete', { paths }, 'Unable to delete selected items.')
      succeeded = true
      onOpenChange(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete selected items.')
    } finally {
      setIsSubmitting(false)
      if (succeeded) window.requestAnimationFrame(onFinish)
      else onFinish()
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onCloseAutoFocus()
        }}
        onEscapeKeyDown={(event) => {
          if (isSubmitting) event.preventDefault()
        }}
      >
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
          <AlertDialogDescription>This permanently deletes the selected files and folders.</AlertDialogDescription>
        </AlertDialogHeader>
        {errorMessage ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        <form
          onSubmit={(event) => {
            void deleteItems(event)
          }}
        >
          <AlertDialogFooter className="flex-row justify-end">
            {errorMessage ? (
              <AlertDialogCancel disabled={isSubmitting} onClick={() => changeOpen(false)}>
                Close
              </AlertDialogCancel>
            ) : (
              <AlertDialogCancel disabled={isSubmitting} onClick={() => changeOpen(false)}>
                Cancel
              </AlertDialogCancel>
            )}
            {!errorMessage ? (
              <Button
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isSubmitting || isLocked}
                type="submit"
                variant="destructive"
              >
                {isSubmitting ? 'Deleting…' : 'Delete'}
              </Button>
            ) : null}
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
