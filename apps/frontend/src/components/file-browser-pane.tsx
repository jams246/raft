'use client'

import type { FileEntry } from '@raft/shared'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from 'react'
import { DeleteConfirmationDialog } from './delete-confirmation-dialog'
import { canDownloadSelection, downloadSelection } from './file-browser-download'
import { getBreadcrumbs } from './file-browser-breadcrumbs'
import { getSelectableRangePaths, sortFileEntries, type SortColumn } from './file-browser-list'
import { FileBrowserListing } from './file-browser-listing'
import { FileBrowserToolbar } from './file-browser-toolbar'
import { createUploadSelection, type UploadSelection } from './file-browser-upload'
import { NewFolderDialog } from './new-folder-dialog'
import { RenameDialog } from './rename-dialog'
import { UploadDialog } from './upload-dialog'
import { useDirectoryListing } from './use-directory-listing'
import type { FileBrowserPaneState } from './file-browser-pane-state'

type PanePosition = 'left' | 'right'

interface FileBrowserPaneProps {
  pane: FileBrowserPaneState
  position: PanePosition
  isOperationLocked: boolean
  onChangePane: (update: (pane: FileBrowserPaneState) => FileBrowserPaneState) => void
  onInteraction: () => void
  onRegisterListingRefresh: (paneId: number, refresh?: () => void) => void
  onRefreshVisible: () => void
  onUploadError: (error: string) => void
  onUploadRequestStarted: (controller: AbortController) => void
  onUploadRequestFinished: (controller: AbortController, error?: string) => void
}

export function FileBrowserPane({
  pane,
  position,
  isOperationLocked,
  onChangePane,
  onInteraction,
  onRegisterListingRefresh,
  onRefreshVisible,
  onUploadError,
  onUploadRequestStarted,
  onUploadRequestFinished
}: FileBrowserPaneProps) {
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false)
  const [deletePaths, setDeletePaths] = useState<string[]>()
  const [renameItem, setRenameItem] = useState<FileEntry>()
  const [uploadSelection, setUploadSelection] = useState<UploadSelection>()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const { listing, isLoading, hasError, refresh } = useDirectoryListing(pane.path)
  const entries = listing?.entries ?? EMPTY_ENTRIES
  const sortedEntries = useMemo(() => sortFileEntries(entries, pane.sortColumn, pane.sortDirection), [entries, pane.sortColumn, pane.sortDirection])
  const selectedPathSet = useMemo(() => new Set(pane.selectedPaths), [pane.selectedPaths])
  const breadcrumbs = getBreadcrumbs(pane.path)
  const isEmpty = pane.path === '/' ? !entries.some((entry) => entry.type === 'directory') : entries.length === 0
  const selectedEntry = pane.selectedPaths.length === 1 ? entries.find((entry) => entry.path === pane.selectedPaths[0]) : undefined
  const canDownload = !isLoading && !hasError && canDownloadSelection(entries, pane.selectedPaths)
  const canRename = pane.path !== '/' && Boolean(selectedEntry && selectedEntry.type !== 'unsupported' && !selectedEntry.protectedRoot)
  const canDelete =
    pane.path !== '/' &&
    pane.selectedPaths.length > 0 &&
    pane.selectedPaths.every((selectedPath) => entries.some((entry) => entry.path === selectedPath && entry.type !== 'unsupported' && !entry.protectedRoot))

  useEffect(() => folderInputRef.current?.setAttribute('webkitdirectory', ''), [])
  useLayoutEffect(() => {
    onRegisterListingRefresh(pane.id, refresh)
    return () => onRegisterListingRefresh(pane.id)
  }, [onRegisterListingRefresh, pane.id, refresh])

  function clearSelection() {
    onChangePane((currentPane) => ({ ...currentPane, selectedPaths: [], selectionAnchor: undefined }))
  }

  function navigateTo(nextPath: string) {
    window.scrollTo(0, 0)
    onChangePane((currentPane) => ({ ...currentPane, path: nextPath, selectedPaths: [], selectionAnchor: undefined }))
  }

  function changeSort(column: SortColumn) {
    onChangePane((currentPane) => {
      if (!currentPane.hasSorted || column !== currentPane.sortColumn) {
        return { ...currentPane, sortColumn: column, sortDirection: 'asc', hasSorted: true }
      }
      return { ...currentPane, sortDirection: currentPane.sortDirection === 'asc' ? 'desc' : 'asc' }
    })
  }

  function selectEntry(entry: FileEntry, event: MouseEvent<HTMLTableRowElement>) {
    if (entry.type === 'unsupported') return
    const { shiftKey, ctrlKey, metaKey } = event
    onChangePane((currentPane) => {
      if (shiftKey) {
        const anchorExists = sortedEntries.some((item) => item.path === currentPane.selectionAnchor)
        return {
          ...currentPane,
          selectedPaths: getSelectableRangePaths(sortedEntries, currentPane.selectionAnchor, entry.path),
          selectionAnchor: anchorExists ? currentPane.selectionAnchor : entry.path
        }
      }
      if (ctrlKey || metaKey) {
        const selected = currentPane.selectedPaths.includes(entry.path)
        return {
          ...currentPane,
          selectedPaths: selected ? currentPane.selectedPaths.filter((item) => item !== entry.path) : [...currentPane.selectedPaths, entry.path],
          selectionAnchor: entry.path
        }
      }
      return { ...currentPane, selectedPaths: [entry.path], selectionAnchor: entry.path }
    })
  }

  function readUploadSelection(event: ChangeEvent<HTMLInputElement>, isFolder: boolean) {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    onUploadError('')
    try {
      setUploadSelection(createUploadSelection(files, isFolder))
    } catch (error) {
      onUploadError(error instanceof Error ? error.message : 'Unable to read selected items.')
    }
  }

  const closeUploadDialog = useCallback(() => setUploadSelection(undefined), [])
  const beginUploadRequest = useCallback(
    (controller: AbortController) => {
      setUploadSelection(undefined)
      onUploadRequestStarted(controller)
    },
    [onUploadRequestStarted]
  )

  return (
    <section
      aria-label={`${position === 'left' ? 'Left' : 'Right'} file pane`}
      className="file-browser__pane"
      onFocusCapture={onInteraction}
      onPointerDownCapture={onInteraction}
    >
      <nav aria-label="Current location" className="file-browser__breadcrumbs">
        {breadcrumbs.map((breadcrumb, index) => (
          <span className="file-browser__breadcrumb" key={breadcrumb.path}>
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {index === breadcrumbs.length - 1 ? (
              <span aria-current="page">{breadcrumb.name}</span>
            ) : (
              <button className="file-browser__breadcrumb-link" onClick={() => navigateTo(breadcrumb.path)} type="button">
                {breadcrumb.name}
              </button>
            )}
          </span>
        ))}
      </nav>
      <FileBrowserToolbar
        key={`${pane.path}:${isOperationLocked}`}
        canCreateFolder={pane.path !== '/'}
        canDelete={canDelete}
        canDownload={canDownload}
        canRename={canRename}
        canUpload={pane.path !== '/'}
        isOperationLocked={isOperationLocked}
        onCreateFolder={() => setIsNewFolderDialogOpen(true)}
        onDelete={() => canDelete && setDeletePaths(pane.selectedPaths)}
        onDownload={() => canDownload && downloadSelection(pane.selectedPaths)}
        onRename={() => selectedEntry && canRename && setRenameItem(selectedEntry)}
        onUploadFiles={() => fileInputRef.current?.click()}
        onUploadFolder={() => folderInputRef.current?.click()}
        position={position}
      />
      <input
        aria-label="Choose files to upload"
        className="file-browser__upload-input"
        multiple
        onChange={(event) => readUploadSelection(event, false)}
        ref={fileInputRef}
        type="file"
      />
      <input
        aria-label="Choose a folder to upload"
        className="file-browser__upload-input"
        onChange={(event) => readUploadSelection(event, true)}
        ref={folderInputRef}
        type="file"
      />
      <FileBrowserListing
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
      {isNewFolderDialogOpen ? (
        <NewFolderDialog isLocked={isOperationLocked} onClose={() => setIsNewFolderDialogOpen(false)} onRefresh={onRefreshVisible} parentPath={pane.path} />
      ) : null}
      {renameItem ? (
        <RenameDialog
          isLocked={isOperationLocked}
          item={renameItem}
          onClose={() => setRenameItem(undefined)}
          onRefresh={onRefreshVisible}
          onSuccess={clearSelection}
        />
      ) : null}
      {deletePaths ? (
        <DeleteConfirmationDialog
          isLocked={isOperationLocked}
          onClose={() => setDeletePaths(undefined)}
          onFinish={() => {
            clearSelection()
            onRefreshVisible()
          }}
          paths={deletePaths}
        />
      ) : null}
      {uploadSelection ? (
        <UploadDialog
          directory={pane.path}
          isOperationLocked={isOperationLocked}
          onClose={closeUploadDialog}
          onRequestFinished={onUploadRequestFinished}
          onRequestStarted={beginUploadRequest}
          selection={uploadSelection}
        />
      ) : null}
    </section>
  )
}

const EMPTY_ENTRIES: FileEntry[] = []
