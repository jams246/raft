'use client'

import { useCallback, useRef, useState } from 'react'
import type { TransferState } from '@raft/shared'
import { CopyWorkflow } from './copy-workflow'
import { FileBrowserPane } from './file-browser-pane'
import { createFileBrowserPaneState, type FileBrowserPaneState } from './file-browser-pane-state'
import { useTransferEvents } from './use-transfer-events'
import { CancelUploadButton } from './cancel-upload-button'

interface TransferWorkflowState {
  kind: 'copy' | 'move'
  sourcePaths: string[]
  destinationPath: string
  destinationPane?: FileBrowserPaneState
}

export function FileBrowser() {
  const [panes, setPanes] = useState(() => [createFileBrowserPaneState(0, '/')])
  const mostRecentlyInteractedPaneId = useRef(0)
  const [uploadPending, setUploadPending] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [transferError, setTransferError] = useState('')
  const [pendingTransferKind, setPendingTransferKind] = useState<'copy' | 'move'>()
  const [transferWorkflow, setTransferWorkflow] = useState<TransferWorkflowState>()
  const refreshCallbacks = useRef(new Map<number, () => void>())
  const nextPaneId = useRef(1)
  const uploadController = useRef<AbortController | undefined>(undefined)
  const transferController = useRef<AbortController | undefined>(undefined)

  const registerListingRefresh = useCallback((paneId: number, refresh?: () => void) => {
    if (refresh) refreshCallbacks.current.set(paneId, refresh)
    else refreshCallbacks.current.delete(paneId)
  }, [])
  const refreshVisibleListings = useCallback(() => {
    refreshCallbacks.current.forEach((refresh) => refresh())
  }, [])
  const finishTransfer = useCallback(() => {
    const controller = uploadController.current
    uploadController.current = undefined
    controller?.abort()
    const pendingTransfer = transferController.current
    transferController.current = undefined
    pendingTransfer?.abort()
    setUploadPending(false)
    setPendingTransferKind(undefined)
  }, [])
  const { operation, isConnected, notice } = useTransferEvents(refreshVisibleListings, finishTransfer)

  const destinationPane = transferWorkflow?.destinationPane
  const visiblePanes = destinationPane ? [...panes, destinationPane] : panes
  const isDualPane = visiblePanes.length === 2
  const transferPending = pendingTransferKind !== undefined
  const isOperationLocked = !isConnected || operation !== null || uploadPending || transferPending
  const displayNotice = notice || uploadError || transferError

  function changePane(paneId: number, update: (pane: FileBrowserPaneState) => FileBrowserPaneState) {
    if (destinationPane?.id === paneId) {
      setTransferWorkflow((workflow) => workflow?.destinationPane && { ...workflow, destinationPane: update(workflow.destinationPane) })
      return
    }
    setPanes((currentPanes) => currentPanes.map((pane) => (pane.id === paneId ? update(pane) : pane)))
  }

  function toggleDualPane() {
    if (!isDualPane) {
      const currentPane = panes[0]
      setPanes([...panes, createFileBrowserPaneState(nextPaneId.current++, currentPane.path)])
      return
    }

    const retainedPane = panes.find((pane) => pane.id === mostRecentlyInteractedPaneId.current) ?? panes[0]
    setPanes([retainedPane])
    mostRecentlyInteractedPaneId.current = retainedPane.id
  }

  const beginUploadRequest = useCallback((controller: AbortController) => {
    uploadController.current = controller
    setUploadPending(true)
    setUploadError('')
  }, [])
  const finishUploadRequest = useCallback(
    (controller: AbortController, error?: string) => {
      if (uploadController.current !== controller) return
      uploadController.current = undefined
      setUploadPending(false)
      setUploadError(error ?? '')
      refreshVisibleListings()
    },
    [refreshVisibleListings]
  )
  const beginTransferRequest = useCallback(
    (kind: 'copy' | 'move', controller: AbortController) => {
      transferController.current = controller
      if (destinationPane) setPanes((currentPanes) => [...currentPanes, destinationPane])
      setTransferWorkflow(undefined)
      setPendingTransferKind(kind)
      setTransferError('')
    },
    [destinationPane, setTransferWorkflow]
  )
  const finishTransferRequest = useCallback(
    (controller: AbortController, error?: string) => {
      if (transferController.current !== controller) return
      transferController.current = undefined
      setPendingTransferKind(undefined)
      setTransferError(error ?? '')
      refreshVisibleListings()
    },
    [refreshVisibleListings]
  )

  function requestTransfer(kind: 'copy' | 'move', sourcePane: FileBrowserPaneState, sourcePaths: string[]) {
    const destinationPane = panes.length === 2 ? panes.find((pane) => pane.id !== sourcePane.id) : undefined
    setTransferWorkflow({
      kind,
      sourcePaths: [...sourcePaths],
      destinationPath: destinationPane?.path ?? '/',
      destinationPane: destinationPane ? undefined : createFileBrowserPaneState(nextPaneId.current++, '/')
    })
  }

  return (
    <main className="file-browser">
      <header className="file-browser__header">
        <div>
          <h1 className="file-browser__title">File Browser</h1>
          {destinationPane && transferWorkflow ? (
            <p className="copy-workflow__summary">
              {transferWorkflow.kind === 'move' ? 'Moving' : 'Copying'} {transferWorkflow.sourcePaths.length}{' '}
              {transferWorkflow.sourcePaths.length === 1 ? 'item' : 'items'}. Choose a destination in the right pane.
            </p>
          ) : null}
        </div>
        <button aria-pressed={isDualPane} className="file-browser__pane-toggle" disabled={Boolean(transferWorkflow)} onClick={toggleDualPane} type="button">
          Dual Pane
        </button>
      </header>
      <div className={isDualPane ? 'file-browser__panes file-browser__panes--dual' : 'file-browser__panes'}>
        {visiblePanes.map((pane, index) => (
          <FileBrowserPane
            isFrozen={Boolean(destinationPane && pane.id !== destinationPane.id)}
            isNavigationOnly={pane.id === destinationPane?.id}
            isOperationLocked={isOperationLocked}
            isTransferDestinationAllowed={panes.length === 1 || panes.find((candidate) => candidate.id !== pane.id)?.path !== '/'}
            key={pane.id}
            onChangePane={(update) => changePane(pane.id, update)}
            onCopy={(sourcePaths) => requestTransfer('copy', pane, sourcePaths)}
            onMove={(sourcePaths) => requestTransfer('move', pane, sourcePaths)}
            onInteraction={() => {
              mostRecentlyInteractedPaneId.current = pane.id
            }}
            onRefreshVisible={refreshVisibleListings}
            onRegisterListingRefresh={registerListingRefresh}
            onUploadError={setUploadError}
            onUploadRequestFinished={finishUploadRequest}
            onUploadRequestStarted={beginUploadRequest}
            pane={pane}
            position={index === 0 ? 'left' : 'right'}
          />
        ))}
      </div>
      {transferWorkflow ? (
        <CopyWorkflow
          chooseDestination={Boolean(destinationPane)}
          destinationPath={destinationPane?.path ?? transferWorkflow.destinationPath}
          key={`${transferWorkflow.kind}:${destinationPane?.path ?? transferWorkflow.destinationPath}`}
          kind={transferWorkflow.kind}
          isOperationLocked={isOperationLocked}
          onCancel={() => setTransferWorkflow(undefined)}
          onRequestFinished={finishTransferRequest}
          onRequestStarted={beginTransferRequest}
          sourcePaths={transferWorkflow.sourcePaths}
        />
      ) : null}
      <section
        aria-label="Operation status"
        aria-live="polite"
        className="file-browser__operation-area"
        hidden={!operation && !displayNotice && !uploadPending && !transferPending}
      >
        {operation ? (
          <>
            <p>{getTransferDescription(operation)}</p>
            <p>
              {operation.current} / {operation.total} items
            </p>
            {operation.kind === 'upload' ? <CancelUploadButton isConnected={isConnected} key={operation.id} operationId={operation.id} /> : null}
          </>
        ) : null}
        {!operation && uploadPending ? <p>Starting upload…</p> : null}
        {!operation && transferPending ? <p>Starting {pendingTransferKind}…</p> : null}
        {displayNotice ? <p role="alert">{displayNotice}</p> : null}
      </section>
    </main>
  )
}

function getTransferDescription(operation: TransferState): string {
  if (operation.kind === 'upload') return `Uploading “${operation.currentName ?? 'items'}”`
  const action = operation.kind === 'move' ? 'Moving' : 'Copying'
  return `${action} “${operation.currentName ?? 'items'}” to ${operation.destinationName ?? 'destination'}`
}
