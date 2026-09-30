'use client'

import type { TransferEvent, TransferState } from '@raft/shared'
import { useLayoutEffect, useRef, useState } from 'react'

export function useTransferEvents(
  visiblePaths: string[],
  refreshListings: () => void,
  refreshDirectory: (path: string) => void,
  onTransferFinished: () => void,
  onTransferStarted: () => void
) {
  const [operation, setOperation] = useState<TransferState | null>(null)
  const [notice, setNotice] = useState('')
  const hadActiveOperation = useRef(false)
  const pathParameters = new URLSearchParams()
  visiblePaths.forEach((path) => pathParameters.append('path', path))
  const pathQuery = pathParameters.toString()
  const [connection, setConnection] = useState({ pathQuery, isConnected: false })
  if (connection.pathQuery !== pathQuery) setConnection({ pathQuery, isConnected: false })

  useLayoutEffect(() => {
    const eventSource = new EventSource(`/api/events?${pathQuery}`)
    let isCurrent = true
    eventSource.onerror = () => {
      if (!isCurrent) return
      setConnection({ pathQuery, isConnected: false })
      refreshListings()
    }
    eventSource.onmessage = (message) => {
      if (!isCurrent) return
      let event: TransferEvent
      try {
        event = JSON.parse(message.data) as TransferEvent
      } catch {
        return
      }

      if (event.type === 'operation_state') {
        const operationEnded = !event.operation && hadActiveOperation.current
        if (operationEnded) onTransferFinished()
        if (event.operation) onTransferStarted()
        hadActiveOperation.current = event.operation !== null
        setConnection({ pathQuery, isConnected: true })
        setOperation(event.operation)
        if (event.operation) setNotice('')
        else if (operationEnded) setNotice('Operation ended.')
        refreshListings()
        return
      }

      if (event.type === 'directory_changed') {
        refreshDirectory(event.path)
        return
      }

      if (event.type === 'operation_started' || event.type === 'operation_progress') {
        hadActiveOperation.current = true
        setOperation(event.operation)
        if (event.type === 'operation_started') {
          onTransferStarted()
          setNotice('')
        }
        return
      }

      setOperation(null)
      hadActiveOperation.current = false
      onTransferFinished()
      setNotice(event.type === 'operation_failed' ? event.message : 'Operation completed.')
    }

    return () => {
      isCurrent = false
      eventSource.close()
    }
  }, [onTransferFinished, onTransferStarted, pathQuery, refreshDirectory, refreshListings])

  return { operation, isConnected: connection.pathQuery === pathQuery && connection.isConnected, notice }
}
