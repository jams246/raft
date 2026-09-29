'use client'

import { useState } from 'react'

export function CancelUploadButton({ operationId, isConnected }: { operationId: string; isConnected: boolean }) {
  const [isCancelling, setIsCancelling] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function cancelUpload() {
    setIsCancelling(true)
    setErrorMessage('')
    try {
      const response = await fetch(`/api/upload/${encodeURIComponent(operationId)}/cancel`, { method: 'POST' })
      if (!response.ok && response.status !== 404) {
        throw new Error('Unable to cancel upload. Try again.')
      }
    } catch {
      setErrorMessage('Unable to cancel upload. Check the connection and try again.')
      setIsCancelling(false)
    }
  }

  return (
    <>
      <button disabled={!isConnected || isCancelling} onClick={() => void cancelUpload()} type="button">
        {isCancelling ? 'Cancelling…' : 'Cancel upload'}
      </button>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
    </>
  )
}
