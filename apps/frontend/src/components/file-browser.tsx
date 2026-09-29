'use client'

import { useCallback, useRef, useState } from 'react'
import { CopyWorkflow } from './copy-workflow'
import { FileBrowserPane } from './file-browser-pane'
import { createFileBrowserPaneState, type FileBrowserPaneState } from './file-browser-pane-state'
import { useTransferEvents } from './use-transfer-events'
import { CancelUploadButton } from './cancel-upload-button'

interface CopyWorkflowState {
  sourcePaths: string[]
  destinationPath: string
  destinationPane?: FileBrowserPaneState
}

export function FileBrowser() {
  const [panes, setPanes] = useState(() => [createFileBrowserPaneState(0, '/')])
  const mostRecentlyInteractedPaneId = useRef(0)
  const [uploadPending, setUploadPending] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [copyError, setCopyError] = useState('')
  const [copyPending, setCopyPending] = useState(false)
  const [copyWorkflow, setCopyWorkflow] = useState<CopyWorkflowState>()
  const refreshCallbacks = useRef(new Map<number, () => void>())
  const nextPaneId = useRef(1)
  const uploadController = useRef<AbortController | undefined>(undefined)
  const copyController = useRef<AbortController | undefined>(undefined)

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
    const pendingCopy = copyController.current
    copyController.current = undefined
    pendingCopy?.abort()
    setUploadPending(false)
    setCopyPending(false)
  }, [])
  const { operation, isConnected, notice } = useTransferEvents(refreshVisibleListings, finishTransfer)

  const destinationPane = copyWorkflow?.destinationPane
  const visiblePanes = destinationPane ? [...panes, destinationPane] : panes
  const isDualPane = visiblePanes.length === 2
  const isOperationLocked = !isConnected || operation !== null || uploadPending || copyPending
  const displayNotice = notice || uploadError || copyError

  function changePane(paneId: number, update: (pane: FileBrowserPaneState) => FileBrowserPaneState) {
    if (destinationPane?.id === paneId) {
      setCopyWorkflow((workflow) => workflow?.destinationPane && { ...workflow, destinationPane: update(workflow.destinationPane) })
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
  const beginCopyRequest = useCallback(
    (controller: AbortController) => {
      copyController.current = controller
      if (destinationPane) setPanes((currentPanes) => [...currentPanes, destinationPane])
      setCopyWorkflow(undefined)
      setCopyPending(true)
      setCopyError('')
    },
    [destinationPane, setCopyWorkflow]
  )
  const finishCopyRequest = useCallback(
    (controller: AbortController, error?: string) => {
      if (copyController.current !== controller) return
      copyController.current = undefined
      setCopyPending(false)
      setCopyError(error ?? '')
      refreshVisibleListings()
    },
    [refreshVisibleListings]
  )

  function requestCopy(sourcePane: FileBrowserPaneState, sourcePaths: string[]) {
    const destinationPane = panes.length === 2 ? panes.find((pane) => pane.id !== sourcePane.id) : undefined
    setCopyWorkflow({
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
          {destinationPane ? (
            <p className="copy-workflow__summary">
              Copying {copyWorkflow.sourcePaths.length} {copyWorkflow.sourcePaths.length === 1 ? 'item' : 'items'}. Choose a destination in the right pane.
            </p>
          ) : null}
        </div>
        <button aria-pressed={isDualPane} className="file-browser__pane-toggle" disabled={Boolean(copyWorkflow)} onClick={toggleDualPane} type="button">
          Dual Pane
        </button>
      </header>
      <div className={isDualPane ? 'file-browser__panes file-browser__panes--dual' : 'file-browser__panes'}>
        {visiblePanes.map((pane, index) => (
          <FileBrowserPane
            isFrozen={Boolean(destinationPane && pane.id !== destinationPane.id)}
            isNavigationOnly={pane.id === destinationPane?.id}
            isOperationLocked={isOperationLocked}
            isCopyDestinationAllowed={panes.length === 1 || panes.find((candidate) => candidate.id !== pane.id)?.path !== '/'}
            key={pane.id}
            onChangePane={(update) => changePane(pane.id, update)}
            onCopy={(sourcePaths) => requestCopy(pane, sourcePaths)}
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
      {copyWorkflow ? (
        <CopyWorkflow
          chooseDestination={Boolean(destinationPane)}
          destinationPath={destinationPane?.path ?? copyWorkflow.destinationPath}
          key={destinationPane?.path ?? copyWorkflow.destinationPath}
          isOperationLocked={isOperationLocked}
          onCancel={() => setCopyWorkflow(undefined)}
          onRequestFinished={finishCopyRequest}
          onRequestStarted={beginCopyRequest}
          sourcePaths={copyWorkflow.sourcePaths}
        />
      ) : null}
      <section
        aria-label="Operation status"
        aria-live="polite"
        className="file-browser__operation-area"
        hidden={!operation && !displayNotice && !uploadPending && !copyPending}
      >
        {operation ? (
          <>
            <p>
              {operation.kind === 'copy'
                ? `Copying “${operation.currentName ?? 'items'}” to ${operation.destinationName ?? 'destination'}`
                : `Uploading “${operation.currentName ?? 'items'}”`}
            </p>
            <p>
              {operation.current} / {operation.total} items
            </p>
            {operation.kind === 'upload' ? <CancelUploadButton isConnected={isConnected} key={operation.id} operationId={operation.id} /> : null}
          </>
        ) : null}
        {!operation && uploadPending ? <p>Starting upload…</p> : null}
        {!operation && copyPending ? <p>Starting copy…</p> : null}
        {displayNotice ? <p role="alert">{displayNotice}</p> : null}
      </section>
    </main>
  )
}
