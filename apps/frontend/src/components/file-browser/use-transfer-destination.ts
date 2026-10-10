'use client'

import { useCallback, useState } from 'react'
import type { FileBrowserPaneState } from './file-browser-pane-state'
import { resetMissingPane, type useFileBrowserLayout } from './use-file-browser-layout'

export interface TransferWorkflowState {
  kind: 'copy' | 'move'
  sourcePaths: string[]
  destinationPath: string
  destinationPane?: FileBrowserPaneState
}

export function useTransferDestination({ panes, setPanes, createPane }: ReturnType<typeof useFileBrowserLayout>) {
  const [transferWorkflow, setTransferWorkflow] = useState<TransferWorkflowState>()
  const destinationPane = transferWorkflow?.destinationPane

  function changePane(paneId: number, update: (pane: FileBrowserPaneState) => FileBrowserPaneState) {
    if (destinationPane?.id === paneId) {
      setTransferWorkflow((workflow) => workflow?.destinationPane && { ...workflow, destinationPane: update(workflow.destinationPane) })
      return
    }
    setPanes((currentPanes) => currentPanes.map((pane) => (pane.id === paneId ? update(pane) : pane)))
  }

  function requestTransfer(kind: 'copy' | 'move', sourcePane: FileBrowserPaneState, sourcePaths: string[]) {
    const existingDestinationPane = panes.length === 2 ? panes.find((pane) => pane.id !== sourcePane.id) : undefined
    setTransferWorkflow({
      kind,
      sourcePaths: [...sourcePaths],
      destinationPath: existingDestinationPane?.path ?? '/',
      ...(existingDestinationPane ? {} : { destinationPane: createPane('/') })
    })
  }

  const acceptDestination = useCallback(() => {
    if (destinationPane) setPanes((currentPanes) => [...currentPanes, destinationPane])
    setTransferWorkflow(undefined)
  }, [destinationPane, setPanes])

  const recoverDestinationDirectory = useCallback((paneId: number, path: string) => {
    setTransferWorkflow((workflow) => {
      if (workflow?.destinationPane?.id !== paneId) return workflow
      return { ...workflow, destinationPane: resetMissingPane(workflow.destinationPane, path) }
    })
  }, [])

  return { transferWorkflow, setTransferWorkflow, destinationPane, changePane, requestTransfer, acceptDestination, recoverDestinationDirectory }
}
