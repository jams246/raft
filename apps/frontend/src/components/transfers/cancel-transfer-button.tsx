'use client'

import { useState } from 'react'
import { ApiRequestError } from '@/lib/api/api-error'
import { API_REQUEST_TIMEOUT_MS, apiRequest } from '@/lib/api/api-request'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

const NOT_FOUND_STATUS = 404

export function CancelTransferButton({ operationId, kind, isConnected }: { operationId: string; kind: 'upload' | 'copy'; isConnected: boolean }) {
  const [isCancelling, setIsCancelling] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function cancelTransfer() {
    setIsCancelling(true)
    setErrorMessage('')
    try {
      await apiRequest(`/api/${kind}/${encodeURIComponent(operationId)}/cancel`, {
        method: 'POST',
        failureMessage: `Unable to cancel ${kind}.`,
        timeoutMs: API_REQUEST_TIMEOUT_MS
      })
    } catch (error: unknown) {
      // A transfer that already finished is no longer active, which is the outcome cancelling asked for.
      if (error instanceof ApiRequestError && error.status === NOT_FOUND_STATUS) return
      setErrorMessage(`Unable to cancel ${kind}. Check the connection and try again.`)
      setIsCancelling(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        disabled={!isConnected || isCancelling}
        onClick={() => {
          void cancelTransfer()
        }}
        type="button"
      >
        {isCancelling ? 'Cancelling…' : `Cancel ${kind}`}
      </Button>
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
    </>
  )
}
