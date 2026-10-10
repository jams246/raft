'use client'

import { useEffect, useState } from 'react'
import { API_REQUEST_TIMEOUT_MS, apiJson } from '@/lib/api/api-request'
import { decodeApiHealth } from '@/lib/api/decoders'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function ConfigurationWarning() {
  const [message, setMessage] = useState('Checking storage configuration…')
  const [hasError, setHasError] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const failureMessage = 'Unable to check storage configuration.'
    const options = { cache: 'no-store', failureMessage, signal: controller.signal, timeoutMs: API_REQUEST_TIMEOUT_MS } as const
    // The rejection is handled by the catch below, which ignores cancellation from unmount or retry.
    void apiJson('/api/health', options, decodeApiHealth)
      .then((health) => {
        if (!controller.signal.aborted) setMessage(health.warnings?.join(' ') ?? '')
        return undefined
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setMessage('Unable to check storage configuration. Retry to see configuration warnings.')
        setHasError(true)
      })
    return () => controller.abort()
    // revision retries the configuration request.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [revision])

  if (!message) return null
  return (
    <Alert aria-label="Configuration warning" aria-live="polite" className="flex flex-wrap items-center gap-x-3 rounded-none border-x-0 border-t-0">
      <AlertDescription className="flex flex-wrap items-center gap-3 text-foreground">
        {message}
        {hasError ? (
          <Button
            onClick={() => {
              setHasError(false)
              setMessage('Checking storage configuration…')
              setRevision((current) => current + 1)
            }}
            type="button"
            variant="outline"
          >
            Retry configuration check
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}
