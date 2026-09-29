'use client'

import type { TransferEvent, TransferState } from '@raft/shared'
import { useEffect, useRef, useState } from 'react'

export function useTransferEvents(refreshListing: () => void, onTransferFinished: () => void) {
  const [operation, setOperation] = useState<TransferState | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [notice, setNotice] = useState('')
  const hadActiveOperation = useRef(false)

  useEffect(() => {
    const eventSource = new EventSource('/api/events')
    eventSource.onerror = () => setIsConnected(false)
    eventSource.onmessage = (message) => {
      let event: TransferEvent
      try {
        event = JSON.parse(message.data) as TransferEvent
      } catch {
        return
      }

      if (event.type === 'operation_state') {
        if (!event.operation && hadActiveOperation.current) onTransferFinished()
        hadActiveOperation.current = event.operation !== null
        setIsConnected(true)
        setOperation(event.operation)
        setNotice('')
        refreshListing()
        return
      }

      if (event.type === 'operation_started' || event.type === 'operation_progress') {
        hadActiveOperation.current = true
        setOperation(event.operation)
        if (event.type === 'operation_started') setNotice('')
        return
      }

      setOperation(null)
      hadActiveOperation.current = false
      onTransferFinished()
      refreshListing()
      setNotice(event.type === 'operation_failed' ? event.message : '')
    }

    return () => eventSource.close()
  }, [refreshListing, onTransferFinished])

  return { operation, isConnected, notice }
}
