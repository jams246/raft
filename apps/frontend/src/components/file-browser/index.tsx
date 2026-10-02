'use client'

import { useCallback, useRef } from 'react'
import { ConfigurationWarning } from '../configuration/configuration-warning'
import { CopyWorkflow } from '../transfers/copy-workflow'
import { useTransferEvents } from '../transfers/use-transfer-events'
import { useTransferRequests } from '../transfers/use-transfer-requests'
import { OperationStatus } from '../transfers/operation-status'
import { FileBrowserHeader } from './file-browser-header'
import { FileBrowserPane } from './file-browser-pane'
import { navigatePane } from './file-browser-pane-state'
import { useFileBrowserLayout } from './use-file-browser-layout'
import { useTransferDestination } from './use-transfer-destination'

export function FileBrowser() {
  const layout = useFileBrowserLayout()
  const { panes, mostRecentlyInteractedPaneId, toggleDualPane, recoverPaneDirectory } = layout
  const { transferWorkflow, setTransferWorkflow, destinationPane, changePane, requestTransfer, acceptDestination, recoverDestinationDirectory } =
    useTransferDestination(layout)
  const {
    uploadPending,
    uploadError,
    transferError,
    pendingTransferKind,
    setUploadError,
    setTransferError,
    finishTransfer,
    clearTransferErrors,
    beginUploadRequest,
    finishUploadRequest,
    beginTransferRequest,
    finishTransferRequest
  } = useTransferRequests(acceptDestination)
  const refreshCallbacks = useRef(new Map<number, { path: string; refresh: () => void }>())
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

  const recoverMissingDirectory = useCallback(
    (paneId: number, path: string) => {
      recoverPaneDirectory(paneId, path)
      recoverDestinationDirectory(paneId, path)
      setTransferError('Directory no longer exists. Returned to My Files.')
    },
    [recoverPaneDirectory, recoverDestinationDirectory, setTransferError]
  )

  return (
    <main className="file-browser">
      <FileBrowserHeader
        isDualPane={isDualPane}
        transferWorkflow={transferWorkflow}
        onReturnToMyFiles={() => changePane(mostRecentlyInteractedPaneId.current, (pane) => navigatePane(pane, '/'))}
        onToggleDualPane={() => toggleDualPane(isDualPane)}
      />
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
