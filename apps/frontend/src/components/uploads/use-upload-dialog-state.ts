'use client'

import { useCallback, useState } from 'react'

type RequestStarted = (controller: AbortController) => void

export function useUploadDialogState(onRequestStarted: RequestStarted) {
  const [policy, setPolicy] = useState<'rename' | 'overwrite'>('rename')
  const [errorMessage, setErrorMessage] = useState('')

  const reset = useCallback(() => {
    setPolicy('rename')
    setErrorMessage('')
  }, [])
  const beginRequest = useCallback(
    (controller: AbortController) => {
      reset()
      onRequestStarted(controller)
    },
    [onRequestStarted, reset]
  )

  return { policy, setPolicy, errorMessage, setErrorMessage, reset, beginRequest }
}
