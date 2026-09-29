'use client'

import { useCallback, useRef, useState } from 'react'
import { FileBrowserPane } from './file-browser-pane'
import { createFileBrowserPaneState, type FileBrowserPaneState } from './file-browser-pane-state'
import { useTransferEvents } from './use-transfer-events'
import { CancelUploadButton } from './cancel-upload-button'

export function FileBrowser() {
  const [panes, setPanes] = useState(() => [createFileBrowserPaneState(0, '/')])
  const mostRecentlyInteractedPaneId = useRef(0)
  const [uploadPending, setUploadPending] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const refreshCallbacks = useRef(new Map<number, () => void>())
  const nextPaneId = useRef(1)
  const uploadController = useRef<AbortController | undefined>(undefined)

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
    setUploadPending(false)
  }, [])
  const { operation, isConnected, notice } = useTransferEvents(refreshVisibleListings, finishTransfer)

  const isDualPane = panes.length === 2
  const isOperationLocked = !isConnected || operation !== null || uploadPending
  const displayNotice = notice || uploadError

  function changePane(paneId: number, update: (pane: FileBrowserPaneState) => FileBrowserPaneState) {
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

  return (
    <main className="file-browser">
      <header className="file-browser__header">
        <h1 className="file-browser__title">File Browser</h1>
        <button aria-pressed={isDualPane} className="file-browser__pane-toggle" onClick={toggleDualPane} type="button">
          Dual Pane
        </button>
      </header>
      <div className={isDualPane ? 'file-browser__panes file-browser__panes--dual' : 'file-browser__panes'}>
        {panes.map((pane, index) => (
          <FileBrowserPane
            isOperationLocked={isOperationLocked}
            key={pane.id}
            onChangePane={(update) => changePane(pane.id, update)}
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
      <section
        aria-label="Operation status"
        aria-live="polite"
        className="file-browser__operation-area"
        hidden={!operation && !displayNotice && !uploadPending}
      >
        {operation ? (
          <>
            <p>Uploading “{operation.currentName ?? 'items'}”</p>
            <p>
              {operation.current} / {operation.total} items
            </p>
            <CancelUploadButton isConnected={isConnected} key={operation.id} operationId={operation.id} />
          </>
        ) : null}
        {!operation && uploadPending ? <p>Starting upload…</p> : null}
        {displayNotice ? <p role="alert">{displayNotice}</p> : null}
      </section>
    </main>
  )
}
