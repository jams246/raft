'use client'

import type { RefObject } from 'react'
import type { UploadConflict } from '@raft/shared'
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { OperationDialogContent } from '../file-operations/operation-dialog-content'
import { TransferConflicts } from '../transfers/transfer-conflicts'

interface UploadDialogViewProps {
  open: boolean
  isSubmitting: boolean
  isOperationLocked: boolean
  canRetryCheck: boolean
  isChecking: boolean
  conflicts?: UploadConflict[] | undefined
  policy: 'rename' | 'overwrite'
  errorMessage: string
  cancelButtonRef: RefObject<HTMLButtonElement | null>
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: () => void
  onPolicyChange: (policy: 'rename' | 'overwrite') => void
  onCancel: () => void
  onUpload: () => void
  onRetry: () => void
}

export function UploadDialogView({
  open,
  isSubmitting,
  isOperationLocked,
  canRetryCheck,
  isChecking,
  conflicts,
  policy,
  errorMessage,
  cancelButtonRef,
  onOpenChange,
  onCloseAutoFocus,
  onPolicyChange,
  onCancel,
  onUpload,
  onRetry
}: UploadDialogViewProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <OperationDialogContent
        aria-describedby="upload-description"
        className="max-h-[85dvh] overflow-auto"
        isSubmitting={isSubmitting}
        onReturnFocus={onCloseAutoFocus}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelButtonRef.current?.focus()
        }}
      >
        <DialogHeader className="text-left">
          <DialogTitle>Upload</DialogTitle>
        </DialogHeader>
        <p className="m-0 text-sm text-muted-foreground" id="upload-description">
          Review names and choose a conflict policy before uploading.
        </p>
        {isChecking ? (
          <p aria-live="polite" className="m-0 text-sm">
            Checking upload names…
          </p>
        ) : null}
        <TransferConflicts kind="upload" conflicts={conflicts} policy={policy} disabled={isSubmitting || isOperationLocked} onPolicyChange={onPolicyChange} />
        {errorMessage ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter className="mt-2 flex-row justify-end">
          <Button disabled={isSubmitting} onClick={onCancel} ref={cancelButtonRef} type="button" variant="outline">
            Cancel
          </Button>
          {conflicts ? (
            <Button disabled={isSubmitting || isOperationLocked || !canRetryCheck} onClick={onUpload} type="button">
              {isSubmitting ? 'Uploading…' : 'Upload'}
            </Button>
          ) : null}
          {errorMessage && canRetryCheck ? (
            <Button disabled={isSubmitting || isChecking || isOperationLocked} onClick={onRetry} type="button" variant="outline">
              Try checking again
            </Button>
          ) : null}
        </DialogFooter>
      </OperationDialogContent>
    </Dialog>
  )
}
