'use client'

import type { ApiHealth } from '@raft/shared'
import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function ConfigurationWarning() {
  const [message, setMessage] = useState('Checking storage configuration…')
  const [hasError, setHasError] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/health', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to check storage configuration.')
        const health: ApiHealth = await response.json()
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
