'use client'

import { useState } from 'react'

export function CancelTransferButton({ operationId, kind, isConnected }: { operationId: string; kind: 'upload' | 'copy'; isConnected: boolean }) {
  const [isCancelling, setIsCancelling] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function cancelTransfer() {
    setIsCancelling(true)
    setErrorMessage('')
    try {
      const response = await fetch(`/api/${kind}/${encodeURIComponent(operationId)}/cancel`, { method: 'POST' })
      if (!response.ok && response.status !== 404) {
        throw new Error(`Unable to cancel ${kind}. Try again.`)
      }
    } catch {
      setErrorMessage(`Unable to cancel ${kind}. Check the connection and try again.`)
      setIsCancelling(false)
    }
  }

  return (
    <>
      <button disabled={!isConnected || isCancelling} onClick={() => void cancelTransfer()} type="button">
        {isCancelling ? 'Cancelling…' : `Cancel ${kind}`}
      </button>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
    </>
  )
}
