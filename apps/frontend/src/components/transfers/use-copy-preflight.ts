'use client'

import type { ConflictPolicy, CopyConflict } from '@raft/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CopyWorkflowProps } from './copy-workflow'
import { checkCopyConflicts } from './transfer-requests'

type CopyPreflightOptions = Pick<CopyWorkflowProps, 'kind' | 'sourcePaths' | 'destinationPath' | 'chooseDestination'> & {
  canStartTransfer: () => boolean
  hasRequestStarted: () => boolean
  onStartTransfer: (policy: ConflictPolicy) => Promise<void>
}

export function useCopyPreflight({
  kind,
  sourcePaths,
  destinationPath,
  chooseDestination,
  canStartTransfer,
  hasRequestStarted,
  onStartTransfer
}: CopyPreflightOptions) {
  const [conflicts, setConflicts] = useState<CopyConflict[]>()
  const [isChecking, setIsChecking] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const preflightController = useRef<AbortController | undefined>(undefined)

  const checkConflicts = useCallback(async () => {
    if (!canStartTransfer() || preflightController.current) return
    const controller = new AbortController()
    preflightController.current = controller
    setIsChecking(true)
    setErrorMessage('')
    try {
      const checkedConflicts = await checkCopyConflicts(kind, sourcePaths, destinationPath, controller.signal)
      if (controller.signal.aborted) return
      setConflicts(checkedConflicts)
      if (checkedConflicts.length === 0) await onStartTransfer('rename')
    } catch (error) {
      if (!controller.signal.aborted) setErrorMessage(error instanceof Error ? error.message : `Unable to check ${kind} conflicts.`)
    } finally {
      if (preflightController.current === controller) {
        if (!controller.signal.aborted && !hasRequestStarted()) setIsChecking(false)
        preflightController.current = undefined
      }
    }
  }, [kind, destinationPath, sourcePaths, onStartTransfer, canStartTransfer, hasRequestStarted])

  useEffect(() => {
    let startCheckTimer: number | undefined
    if (!chooseDestination) {
      startCheckTimer = window.setTimeout(() => void checkConflicts(), 0)
    }
    return () => {
      if (startCheckTimer !== undefined) window.clearTimeout(startCheckTimer)
      if (!hasRequestStarted()) preflightController.current?.abort()
    }
  }, [checkConflicts, chooseDestination, hasRequestStarted])

  return { conflicts, isChecking, errorMessage, checkConflicts }
}
