'use client'

import type { UploadConflict } from '@raft/shared'
import { useEffect, useState } from 'react'
import type { UploadSelection } from './file-browser-upload'
import { checkUploadConflicts } from '../transfers/transfer-requests'

interface UploadPreflightOptions {
  directory: string
  selection: UploadSelection
  open: boolean
  hasError: boolean
  onStartWithoutConflicts: () => void
  onError: (message: string) => void
}

export function useUploadPreflight({ directory, selection, open, hasError, onStartWithoutConflicts, onError }: UploadPreflightOptions) {
  const [check, setCheck] = useState<{ selection: UploadSelection; conflicts?: UploadConflict[]; revision: number }>()
  const current = check?.selection === selection ? check : undefined
  const conflicts = current?.conflicts
  const revision = current?.revision ?? 0
  const isChecking = open && conflicts === undefined && !hasError

  useEffect(() => {
    const controller = new AbortController()

    async function checkConflicts() {
      try {
        const result = await checkUploadConflicts(directory, selection, controller.signal)
        if (controller.signal.aborted) return
        setCheck({ selection, conflicts: result, revision })
        if (result.length === 0) onStartWithoutConflicts()
      } catch (error) {
        if (!controller.signal.aborted) onError(error instanceof Error ? error.message : 'Unable to check upload names.')
      }
    }

    if (open) void checkConflicts()
    return () => controller.abort()
  }, [revision, directory, open, selection, onStartWithoutConflicts, onError])

  function retry() {
    onError('')
    setCheck({ selection, revision: revision + 1 })
  }

  return { conflicts, isChecking, retry }
}
