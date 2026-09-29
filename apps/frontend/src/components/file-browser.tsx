'use client'

import type { FileEntry } from '@raft/shared'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from 'react'
import { DeleteConfirmationDialog } from './delete-confirmation-dialog'
import { canDownloadSelection, downloadSelection } from './file-browser-download'
import { getBreadcrumbs } from './file-browser-breadcrumbs'
import { getSelectableRangePaths, sortFileEntries, type SortColumn, type SortDirection } from './file-browser-list'
import { FileBrowserListing } from './file-browser-listing'
import { FileBrowserToolbar } from './file-browser-toolbar'
import { createUploadSelection, type UploadSelection } from './file-browser-upload'
import { NewFolderDialog } from './new-folder-dialog'
import { RenameDialog } from './rename-dialog'
import { UploadDialog } from './upload-dialog'
import { useDirectoryListing } from './use-directory-listing'
import { useTransferEvents } from './use-transfer-events'
import { CancelUploadButton } from './cancel-upload-button'

export function FileBrowser() {
  const [path, setPath] = useState('/')
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [selectionAnchor, setSelectionAnchor] = useState<string>()
  const [sortColumn, setSortColumn] = useState<SortColumn>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [hasSorted, setHasSorted] = useState(false)
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false)
  const [deletePaths, setDeletePaths] = useState<string[]>()
  const [renameItem, setRenameItem] = useState<FileEntry>()
  const [uploadSelection, setUploadSelection] = useState<UploadSelection>()
  const [uploadPending, setUploadPending] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const uploadController = useRef<AbortController | undefined>(undefined)
  const onTransferFinished = useCallback(() => {
    const controller = uploadController.current
    uploadController.current = undefined
    controller?.abort()
    setUploadPending(false)
  }, [])
  const { listing, isLoading, hasError, refresh } = useDirectoryListing(path)
  const { operation, isConnected, notice } = useTransferEvents(refresh, onTransferFinished)
  const entries = listing?.entries ?? EMPTY_ENTRIES
  const sortedEntries = useMemo(() => sortFileEntries(entries, sortColumn, sortDirection), [entries, sortColumn, sortDirection])
  const selectedPathSet = new Set(selectedPaths)
  const isOperationLocked = !isConnected || operation !== null || uploadPending
  const displayNotice = notice || uploadError
  const breadcrumbs = getBreadcrumbs(path)
  const isEmpty = path === '/' ? !entries.some((entry) => entry.type === 'directory') : entries.length === 0
  const selectedEntry = selectedPaths.length === 1 ? entries.find((entry) => entry.path === selectedPaths[0]) : undefined
  const canDownload = !isLoading && !hasError && canDownloadSelection(entries, selectedPaths)
  const canRename = path !== '/' && Boolean(selectedEntry && selectedEntry.type !== 'unsupported' && !selectedEntry.protectedRoot)
  const canDelete =
    path !== '/' &&
    selectedPaths.length > 0 &&
    selectedPaths.every((selectedPath) => entries.some((entry) => entry.path === selectedPath && entry.type !== 'unsupported' && !entry.protectedRoot))
  const closeUploadDialog = useCallback(() => setUploadSelection(undefined), [])
  const beginUploadRequest = useCallback((controller: AbortController) => {
    uploadController.current = controller
    setUploadPending(true)
    setUploadSelection(undefined)
    setUploadError('')
  }, [])
  const finishUploadRequest = useCallback((controller: AbortController, error?: string) => {
    if (uploadController.current !== controller) return
    uploadController.current = undefined
    setUploadPending(false)
    setUploadError(error ?? '')
  }, [])

  useEffect(() => folderInputRef.current?.setAttribute('webkitdirectory', ''), [])
  function clearSelection() {
    setSelectedPaths([])
    setSelectionAnchor(undefined)
  }

  function navigateTo(nextPath: string) {
    clearSelection()
    window.scrollTo(0, 0)
    setPath(nextPath)
  }

  function changeSort(column: SortColumn) {
    if (!hasSorted || column !== sortColumn) {
      setSortColumn(column)
      setSortDirection('asc')
      setHasSorted(true)
    } else setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))
  }

  function selectEntry(entry: FileEntry, event: MouseEvent<HTMLTableRowElement>) {
    if (entry.type === 'unsupported') return
    if (event.shiftKey) {
      setSelectedPaths(getSelectableRangePaths(sortedEntries, selectionAnchor, entry.path))
      if (!sortedEntries.some((item) => item.path === selectionAnchor)) setSelectionAnchor(entry.path)
    } else if (event.ctrlKey || event.metaKey) {
      setSelectedPaths((paths) => (paths.includes(entry.path) ? paths.filter((item) => item !== entry.path) : [...paths, entry.path]))
      setSelectionAnchor(entry.path)
    } else {
      setSelectedPaths([entry.path])
      setSelectionAnchor(entry.path)
    }
  }

  function readUploadSelection(event: ChangeEvent<HTMLInputElement>, isFolder: boolean) {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    setUploadError('')
    try {
      setUploadSelection(createUploadSelection(files, isFolder))
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Unable to read selected items.')
    }
  }

  return (
    <main className="file-browser">
      <header className="file-browser__header">
        <h1 className="file-browser__title">File Browser</h1>
        <button className="file-browser__pane-toggle" disabled type="button">
          Dual Pane
        </button>
      </header>
      <section aria-label="File pane" className="file-browser__pane">
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
          key={`${path}:${isOperationLocked}`}
          canCreateFolder={path !== '/'}
          canDelete={canDelete}
          canDownload={canDownload}
          canRename={canRename}
          canUpload={path !== '/'}
          isOperationLocked={isOperationLocked}
          onCreateFolder={() => setIsNewFolderDialogOpen(true)}
          onDelete={() => canDelete && setDeletePaths(selectedPaths)}
          onDownload={() => canDownload && downloadSelection(selectedPaths)}
          onRename={() => selectedEntry && canRename && setRenameItem(selectedEntry)}
          onUploadFiles={() => fileInputRef.current?.click()}
          onUploadFolder={() => folderInputRef.current?.click()}
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
          path={path}
          selectedPaths={selectedPathSet}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
        />
      </section>
      {isNewFolderDialogOpen ? (
        <NewFolderDialog isLocked={isOperationLocked} onClose={() => setIsNewFolderDialogOpen(false)} onRefresh={refresh} parentPath={path} />
      ) : null}
      {renameItem ? (
        <RenameDialog isLocked={isOperationLocked} item={renameItem} onClose={() => setRenameItem(undefined)} onRefresh={refresh} onSuccess={clearSelection} />
      ) : null}
      {deletePaths ? (
        <DeleteConfirmationDialog
          isLocked={isOperationLocked}
          onClose={() => setDeletePaths(undefined)}
          onFinish={() => {
            clearSelection()
            refresh()
          }}
          paths={deletePaths}
        />
      ) : null}
      {uploadSelection ? (
        <UploadDialog
          directory={path}
          isOperationLocked={isOperationLocked}
          onClose={closeUploadDialog}
          onRequestFinished={finishUploadRequest}
          onRequestStarted={beginUploadRequest}
          selection={uploadSelection}
        />
      ) : null}
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

const EMPTY_ENTRIES: FileEntry[] = []
