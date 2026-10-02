'use client'

import type { FileEntry } from '@raft/shared'
import { useEffect, useLayoutEffect, useMemo, useRef, type MouseEvent } from 'react'
import { FileBrowserLocation } from './file-browser-location'
import { sortFileEntries, type SortColumn } from './file-browser-list'
import { FileBrowserListing } from './file-browser-listing'
import { FileBrowserPaneActions } from './file-browser-pane-actions'
import { navigatePane, selectPaneEntry, sortPane, traversePaneHistory, type FileBrowserPaneState } from './file-browser-pane-state'
import { useDirectoryListing } from './use-directory-listing'

type PanePosition = 'left' | 'right'

interface FileBrowserPaneProps {
  isFrozen?: boolean
  isNavigationOnly?: boolean
  pane: FileBrowserPaneState
  position: PanePosition
  isOperationLocked: boolean
  isTransferDestinationAllowed: boolean
  onChangePane: (update: (pane: FileBrowserPaneState) => FileBrowserPaneState) => void
  onDirectoryNotFound: (paneId: number, path: string) => void
  onInteraction: () => void
  onRegisterListingRefresh: (paneId: number, path: string, refresh?: () => void) => void
  onCopy: (sourcePaths: string[]) => void
  onMove: (sourcePaths: string[]) => void
  onUploadError: (error: string) => void
  onUploadRequestStarted: (controller: AbortController) => void
  onUploadRequestFinished: (controller: AbortController, error?: string) => void
}

export function FileBrowserPane({
  isFrozen = false,
  isNavigationOnly = false,
  pane,
  position,
  isOperationLocked,
  isTransferDestinationAllowed,
  onChangePane,
  onDirectoryNotFound,
  onInteraction,
  onRegisterListingRefresh,
  onCopy,
  onMove,
  onUploadError,
  onUploadRequestStarted,
  onUploadRequestFinished
}: FileBrowserPaneProps) {
  const paneRef = useRef<HTMLElement>(null)
  const { listing, isLoading, hasError, missingPath, refresh } = useDirectoryListing(pane.path)
  const entries = listing?.entries ?? EMPTY_ENTRIES
  const sortedEntries = useMemo(() => sortFileEntries(entries, pane.sortColumn, pane.sortDirection), [entries, pane.sortColumn, pane.sortDirection])
  const selectedPathSet = useMemo(() => new Set(pane.selectedPaths), [pane.selectedPaths])
  const isEmpty = pane.path === '/' ? !entries.some((entry) => entry.type === 'directory') : entries.length === 0
  useLayoutEffect(() => {
    paneRef.current?.scrollTo(0, 0)
  }, [pane.path])
  useLayoutEffect(() => {
    onRegisterListingRefresh(pane.id, pane.path, refresh)
    return () => onRegisterListingRefresh(pane.id, pane.path)
  }, [onRegisterListingRefresh, pane.id, pane.path, refresh])

  useEffect(() => {
    if (missingPath === pane.path && pane.path !== '/') onDirectoryNotFound(pane.id, pane.path)
  }, [missingPath, onDirectoryNotFound, pane.id, pane.path])

  function clearSelection() {
    if (isFrozen || isNavigationOnly) return
    onChangePane((currentPane) => ({ ...currentPane, selectedPaths: [], selectionAnchor: undefined }))
  }

  function navigateTo(nextPath: string) {
    if (isFrozen) return
    onChangePane((currentPane) => navigatePane(currentPane, nextPath))
  }

  function handleHistoryButton(event: MouseEvent<HTMLElement>) {
    if (event.button !== 3 && event.button !== 4) return
    event.preventDefault()
    event.stopPropagation()
    if (isFrozen || event.type !== 'mouseup') return
    const direction = event.button === 3 ? -1 : 1
    onChangePane((currentPane) => traversePaneHistory(currentPane, direction))
  }

  function changeSort(column: SortColumn) {
    if (isFrozen) return
    onChangePane((currentPane) => sortPane(currentPane, column))
  }

  function selectEntry(entry: FileEntry, event: MouseEvent<HTMLTableRowElement>) {
    if (isFrozen || isNavigationOnly || entry.type === 'unsupported') return
    const { shiftKey, ctrlKey, metaKey } = event
    onChangePane((currentPane) => selectPaneEntry(currentPane, sortedEntries, entry.path, { shiftKey, ctrlKey, metaKey }))
  }

  return (
    <section
      aria-label={`${position === 'left' ? 'Left' : 'Right'} file pane`}
      className="file-browser__pane"
      ref={paneRef}
      onFocusCapture={onInteraction}
      onPointerDownCapture={onInteraction}
      onMouseDownCapture={handleHistoryButton}
      onMouseUpCapture={handleHistoryButton}
      onAuxClickCapture={handleHistoryButton}
    >
      <FileBrowserLocation path={pane.path} isFrozen={isFrozen} onNavigate={navigateTo} />
      <FileBrowserPaneActions
        pane={pane}
        position={position}
        entries={entries}
        isHidden={isFrozen || isNavigationOnly}
        isLoading={isLoading}
        hasError={hasError}
        isOperationLocked={isOperationLocked}
        isTransferDestinationAllowed={isTransferDestinationAllowed}
        onClearSelection={clearSelection}
        onCopy={onCopy}
        onMove={onMove}
        onUploadError={onUploadError}
        onUploadRequestStarted={onUploadRequestStarted}
        onUploadRequestFinished={onUploadRequestFinished}
      >
        <FileBrowserListing
          isFrozen={isFrozen}
          isNavigationOnly={isNavigationOnly}
          entries={sortedEntries}
          hasError={hasError}
          isEmpty={isEmpty}
          isLoading={isLoading}
          listing={listing}
          onClearSelection={clearSelection}
          onNavigate={navigateTo}
          onRetry={refresh}
          onSelect={selectEntry}
          onSort={changeSort}
          path={pane.path}
          selectedPaths={selectedPathSet}
          sortColumn={pane.sortColumn}
          sortDirection={pane.sortDirection}
        />
      </FileBrowserPaneActions>
    </section>
  )
}

const EMPTY_ENTRIES: FileEntry[] = []
