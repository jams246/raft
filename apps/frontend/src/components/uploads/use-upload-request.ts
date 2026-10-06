'use client'

import type { UploadConflictPolicy } from '@raft/shared'
import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { UploadDialogProps } from './upload-dialog'
import { createUploadRequest, ensureUploadSucceeded } from '../transfers/transfer-requests'

type UploadRequestOptions = Pick<UploadDialogProps, 'directory' | 'selection' | 'isOperationLocked' | 'onRequestStarted' | 'onRequestFinished'> & {
  mounted: RefObject<boolean>
  onDisableRetry: () => void
  onError: (message: string) => void
}

export function useUploadRequest({
  directory,
  selection,
  isOperationLocked,
  onRequestStarted,
  onRequestFinished,
  mounted,
  onDisableRetry,
  onError
}: UploadRequestOptions) {
  const operationLocked = useRef(isOperationLocked)
  const requestStartedFor = useRef<UploadDialogProps['selection'] | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useLayoutEffect(() => {
    operationLocked.current = isOperationLocked
  }, [isOperationLocked, operationLocked])

  const sendUpload = useCallback(
    async (uploadPolicy: UploadConflictPolicy) => {
      if (operationLocked.current || requestStartedFor.current === selection) return
      const bytesTotal = selection.files.reduce((total, file) => total + file.size, 0)
      if (!Number.isSafeInteger(bytesTotal) || bytesTotal < 0) {
        onDisableRetry()
        onError('The selected files exceed the supported upload size.')
        return
      }
      requestStartedFor.current = selection
      const controller = new AbortController()
      setIsSubmitting(true)
      onError('')
      try {
        const request = createUploadRequest(directory, selection, uploadPolicy, bytesTotal, controller.signal)
        onRequestStarted(controller)
        await ensureUploadSucceeded(await request)
        onRequestFinished(controller)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to upload selected items.'
        onRequestFinished(controller, message)
      } finally {
        if (mounted.current) setIsSubmitting(false)
      }
    },
    // mounted is read after awaiting the upload to avoid updates after unmount.
    // oxlint-disable-next-line react/memo-dependencies
    [directory, onDisableRetry, onError, onRequestFinished, onRequestStarted, selection, mounted]
  )

  return { sendUpload, isSubmitting }
}
