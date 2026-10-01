'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfigurationWarning } from './configuration-warning'
import { CopyWorkflow } from './copy-workflow'
import { FileBrowserPane } from './file-browser-pane'
import { createFileBrowserPaneState, navigatePane, type FileBrowserPaneState } from './file-browser-pane-state'
import { useTransferEvents } from './use-transfer-events'
import { OperationStatus } from './operation-status'

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
  const refreshCallbacks = useRef(new Map<number, { path: string; refresh: () => void }>())
  const nextPaneId = useRef(1)
  const uploadController = useRef<AbortController | undefined>(undefined)
  const transferController = useRef<AbortController | undefined>(undefined)

  useEffect(() => {
    try {
      if (localStorage.getItem('raft:dual-pane') !== 'true') return
      nextPaneId.current = 2
      // oxlint-disable-next-line react/set-state-in-effect -- Restore browser-only storage after hydration to keep server markup consistent.
      setPanes([createFileBrowserPaneState(0, '/'), createFileBrowserPaneState(1, '/')])
    } catch {
      // Browser storage may be blocked; keep the default layout.
    }
  }, [])

  const registerListingRefresh = useCallback((paneId: number, path: string, refresh?: () => void) => {
    if (refresh) refreshCallbacks.current.set(paneId, { path, refresh })
    else refreshCallbacks.current.delete(paneId)
  }, [])
  const refreshVisibleListings = useCallback(() => {
    refreshCallbacks.current.forEach(({ refresh }) => refresh())
  }, [])
  const refreshVisibleDirectory = useCallback((path: string) => {
    refreshCallbacks.current.forEach((listing) => {
      if (listing.path === path) listing.refresh()
    })
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
  const clearTransferErrors = useCallback(() => {
    setUploadError('')
    setTransferError('')
  }, [])
  const destinationPane = transferWorkflow?.destinationPane
  const visiblePanes = destinationPane ? [...panes, destinationPane] : panes
  const visiblePaths = [...new Set(visiblePanes.map((pane) => pane.path))]
  const { operation, isConnected, notice } = useTransferEvents(
    visiblePaths,
    refreshVisibleListings,
    refreshVisibleDirectory,
    finishTransfer,
    clearTransferErrors
  )
  const isDualPane = visiblePanes.length === 2
  const transferPending = pendingTransferKind !== undefined
  const isOperationLocked = !isConnected || operation !== null || uploadPending || transferPending
  const displayNotice = uploadError || transferError || notice

  function changePane(paneId: number, update: (pane: FileBrowserPaneState) => FileBrowserPaneState) {
    if (destinationPane?.id === paneId) {
      setTransferWorkflow((workflow) => workflow?.destinationPane && { ...workflow, destinationPane: update(workflow.destinationPane) })
      return
    }
    setPanes((currentPanes) => currentPanes.map((pane) => (pane.id === paneId ? update(pane) : pane)))
  }

  function toggleDualPane() {
    try {
      localStorage.setItem('raft:dual-pane', String(!isDualPane))
    } catch {
      // Keep toggling available when browser storage is blocked.
    }

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
    setTransferError('')
  }, [])
  const finishUploadRequest = useCallback((controller: AbortController, error?: string) => {
    if (uploadController.current !== controller) return
    uploadController.current = undefined
    setUploadPending(false)
    setUploadError(error ?? '')
  }, [])
  const beginTransferRequest = useCallback(
    (kind: 'copy' | 'move', controller: AbortController) => {
      transferController.current = controller
      if (destinationPane) setPanes((currentPanes) => [...currentPanes, destinationPane])
      setTransferWorkflow(undefined)
      setPendingTransferKind(kind)
      setTransferError('')
      setUploadError('')
    },
    [destinationPane, setTransferWorkflow]
  )
  const finishTransferRequest = useCallback((controller: AbortController, error?: string) => {
    if (transferController.current !== controller) return
    transferController.current = undefined
    setPendingTransferKind(undefined)
    setTransferError(error ?? '')
  }, [])

  const recoverMissingDirectory = useCallback(
    (paneId: number, path: string) => {
      const returnToMyFiles = (pane: FileBrowserPaneState) =>
        pane.path === path ? { ...pane, path: '/', history: ['/'], historyIndex: 0, selectedPaths: [], selectionAnchor: undefined } : pane
      setPanes((currentPanes) => currentPanes.map((pane) => (pane.id === paneId ? returnToMyFiles(pane) : pane)))
      setTransferWorkflow((workflow) =>
        workflow?.destinationPane?.id === paneId ? { ...workflow, destinationPane: returnToMyFiles(workflow.destinationPane) } : workflow
      )
      setTransferError('Directory no longer exists. Returned to My Files.')
    },
    [setPanes, setTransferError, setTransferWorkflow]
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
          <h1 className="file-browser__title">
            <button
              className="file-browser__title-link"
              aria-label="RAFT, return to My files"
              disabled={Boolean(transferWorkflow)}
              onClick={() => changePane(mostRecentlyInteractedPaneId.current, (pane) => navigatePane(pane, '/'))}
              type="button"
            >
              <Image src="/icon.png" alt="" width={32} height={32} unoptimized />
              RAFT
            </button>
            <span className="file-browser__subtitle">
              <span className="file-browser__initial">R</span>emote <span className="file-browser__initial">A</span>ccess{' '}
              <span className="file-browser__initial">F</span>ile <span className="file-browser__initial">T</span>ool
            </span>
          </h1>
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
      <ConfigurationWarning />
      <div className={isDualPane ? 'file-browser__panes file-browser__panes--dual' : 'file-browser__panes'}>
        {visiblePanes.map((pane, index) => (
          <FileBrowserPane
            isFrozen={Boolean(destinationPane && pane.id !== destinationPane.id)}
            isNavigationOnly={pane.id === destinationPane?.id}
            isOperationLocked={isOperationLocked}
            isTransferDestinationAllowed={panes.length === 1 || panes.find((candidate) => candidate.id !== pane.id)?.path !== '/'}
            key={pane.id}
            onChangePane={(update) => changePane(pane.id, update)}
            onDirectoryNotFound={recoverMissingDirectory}
            onCopy={(sourcePaths) => requestTransfer('copy', pane, sourcePaths)}
            onMove={(sourcePaths) => requestTransfer('move', pane, sourcePaths)}
            onInteraction={() => {
              mostRecentlyInteractedPaneId.current = pane.id
            }}
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
      <OperationStatus
        isConnected={isConnected}
        notice={displayNotice}
        operation={operation}
        transferPendingKind={pendingTransferKind}
        uploadPending={uploadPending}
      />
    </main>
  )
}
