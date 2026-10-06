'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useUploadRequest } from './use-upload-request'
import { useUploadPreflight } from './use-upload-preflight'
import { UploadDialogView } from './upload-dialog-view'
import { useUploadDialogState } from './use-upload-dialog-state'
import { useOperationDialogOpenChange } from '../file-operations/use-operation-dialog-open-change'
import type { UploadDialogProps } from './upload-dialog.types'

export type { UploadDialogProps } from './upload-dialog.types'

export function UploadDialog({
  directory,
  selection,
  canRetryCheck,
  onDisableRetry,
  isOperationLocked,
  open,
  onOpenChange,
  onCloseAutoFocus,
  onRequestStarted,
  onRequestFinished
}: UploadDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const mounted = useRef(false)
  const { policy, setPolicy, errorMessage, setErrorMessage, reset, beginRequest } = useUploadDialogState(onRequestStarted)

  const { sendUpload, isSubmitting } = useUploadRequest({
    directory,
    selection,
    isOperationLocked,
    onRequestStarted: beginRequest,
    onRequestFinished,
    mounted,
    onDisableRetry,
    onError: setErrorMessage
  })
  const startWithoutConflicts = useCallback(() => {
    void sendUpload('rename')
  }, [sendUpload])
  const { conflicts, isChecking, retry } = useUploadPreflight({
    directory,
    selection,
    open,
    hasError: Boolean(errorMessage),
    onStartWithoutConflicts: startWithoutConflicts,
    onError: setErrorMessage
  })
  const changeOpen = useOperationDialogOpenChange(isSubmitting, onOpenChange, reset)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  return (
    <UploadDialogView
      canRetryCheck={canRetryCheck}
      cancelButtonRef={cancelButtonRef}
      conflicts={conflicts}
      errorMessage={errorMessage}
      isChecking={isChecking}
      isOperationLocked={isOperationLocked}
      isSubmitting={isSubmitting}
      onCancel={() => changeOpen(false)}
      onCloseAutoFocus={onCloseAutoFocus}
      onOpenChange={changeOpen}
      onPolicyChange={setPolicy}
      onRetry={retry}
      onUpload={() => {
        void sendUpload(policy)
      }}
      open={open}
      policy={policy}
    />
  )
}
