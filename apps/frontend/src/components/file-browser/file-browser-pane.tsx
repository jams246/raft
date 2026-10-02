'use client'

import { FileBrowserLocation } from './file-browser-location'
import { FileBrowserListing } from './file-browser-listing'
import { FileBrowserPaneActions } from './file-browser-pane-actions'
import type { FileBrowserPaneState } from './file-browser-pane-state'
import { useFileBrowserPane } from './use-file-browser-pane'

type PanePosition = 'left' | 'right'

export interface FileBrowserPaneProps {
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
  const {
    paneRef,
    listing,
    isLoading,
    hasError,
    refresh,
    entries,
    sortedEntries,
    selectedPathSet,
    isEmpty,
    clearSelection,
    navigateTo,
    handleHistoryButton,
    changeSort,
    selectEntry
  } = useFileBrowserPane({ pane, isFrozen, isNavigationOnly, onChangePane, onDirectoryNotFound, onRegisterListingRefresh })

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
