'use client'

import { useCallback, useRef, useState } from 'react'

export function useTransferRequests(acceptDestination: () => void) {
  const [uploadPending, setUploadPending] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [transferError, setTransferError] = useState('')
  const [pendingTransferKind, setPendingTransferKind] = useState<'copy' | 'move'>()
  const uploadController = useRef<AbortController | undefined>(undefined)
  const transferController = useRef<AbortController | undefined>(undefined)

  const finishTransfer = useCallback(() => {
    const controller = uploadController.current
    uploadController.current = undefined
    controller?.abort()
    const pendingTransfer = transferController.current
    transferController.current = undefined
    pendingTransfer?.abort()
    setUploadPending(false)
    setPendingTransferKind(undefined)
  }, [])

  const clearTransferErrors = useCallback(() => {
    setUploadError('')
    setTransferError('')
  }, [])

  const beginUploadRequest = useCallback((controller: AbortController) => {
    uploadController.current = controller
    setUploadPending(true)
    setUploadError('')
    setTransferError('')
  }, [])

  const finishUploadRequest = useCallback((controller: AbortController, error?: string) => {
    if (uploadController.current !== controller) return
    uploadController.current = undefined
    setUploadPending(false)
    setUploadError(error ?? '')
  }, [])

  const beginTransferRequest = useCallback(
    (kind: 'copy' | 'move', controller: AbortController) => {
      transferController.current = controller
      acceptDestination()
      setPendingTransferKind(kind)
      setTransferError('')
      setUploadError('')
    },
    [acceptDestination]
  )

  const finishTransferRequest = useCallback((controller: AbortController, error?: string) => {
    if (transferController.current !== controller) return
    transferController.current = undefined
    setPendingTransferKind(undefined)
    setTransferError(error ?? '')
  }, [])

  return {
    uploadPending,
    uploadError,
    transferError,
    pendingTransferKind,
    setUploadError,
    setTransferError,
    finishTransfer,
    clearTransferErrors,
    beginUploadRequest,
    finishUploadRequest,
    beginTransferRequest,
    finishTransferRequest
  }
}
