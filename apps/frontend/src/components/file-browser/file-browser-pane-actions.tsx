'use client'

import type { FileEntry } from '@raft/shared'
import { type ReactNode, useState } from 'react'
import { DeleteConfirmationDialog } from '../file-operations/delete-confirmation-dialog'
import { canDownloadSelection, downloadSelection } from '../file-operations/file-browser-download'
import type { FileBrowserPaneState } from './file-browser-pane-state'
import { FileBrowserToolbar } from './file-browser-toolbar'
import { NewFolderDialog } from '../file-operations/new-folder-dialog'
import { RenameDialog } from '../file-operations/rename-dialog'
import { useFileBrowserUpload } from '../uploads/use-file-browser-upload'

interface FileBrowserPaneActionsProps {
  children: ReactNode
  pane: FileBrowserPaneState
  position: 'left' | 'right'
  entries: FileEntry[]
  isHidden: boolean
  isLoading: boolean
  hasError: boolean
  isOperationLocked: boolean
  isTransferDestinationAllowed: boolean
  onClearSelection: () => void
  onCopy: (sourcePaths: string[]) => void
  onMove: (sourcePaths: string[]) => void
  onUploadError: (error: string) => void
  onUploadRequestStarted: (controller: AbortController) => void
  onUploadRequestFinished: (controller: AbortController, error?: string) => void
}

export function FileBrowserPaneActions({
  children,
  pane,
  position,
  entries,
  isHidden,
  isLoading,
  hasError,
  isOperationLocked,
  isTransferDestinationAllowed,
  onClearSelection,
  onCopy,
  onMove,
  onUploadError,
  onUploadRequestStarted,
  onUploadRequestFinished
}: FileBrowserPaneActionsProps) {
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false)
  const [deletePaths, setDeletePaths] = useState<string[]>()
  const [renameItem, setRenameItem] = useState<FileEntry>()
  const upload = useFileBrowserUpload({
    directory: pane.path,
    isOperationLocked,
    onUploadError,
    onUploadRequestStarted,
    onUploadRequestFinished
  })
  const selectedEntry = pane.selectedPaths.length === 1 ? entries.find((entry) => entry.path === pane.selectedPaths[0]) : undefined
  const canDownload = !isLoading && !hasError && canDownloadSelection(entries, pane.selectedPaths)
  const canRename = pane.path !== '/' && Boolean(selectedEntry && selectedEntry.type !== 'unsupported' && !selectedEntry.protectedRoot)
  const canDelete =
    pane.path !== '/' &&
    pane.selectedPaths.length > 0 &&
    pane.selectedPaths.every((selectedPath) => entries.some((entry) => entry.path === selectedPath && entry.type !== 'unsupported' && !entry.protectedRoot))

  const canTransfer = canDelete && isTransferDestinationAllowed && !isLoading && !hasError

  return (
    <>
      <div hidden={isHidden}>
        <FileBrowserToolbar
          key={`${pane.path}:${isOperationLocked}`}
          canCreateFolder={pane.path !== '/'}
          canTransfer={canTransfer}
          canDelete={canDelete}
          canDownload={canDownload}
          canRename={canRename}
          canUpload={pane.path !== '/'}
          isOperationLocked={isOperationLocked}
          onCreateFolder={() => setIsNewFolderDialogOpen(true)}
          onCopy={() => canTransfer && onCopy(pane.selectedPaths)}
          onMove={() => canTransfer && onMove(pane.selectedPaths)}
          onDelete={() => canDelete && setDeletePaths(pane.selectedPaths)}
          onDownload={() => canDownload && downloadSelection(pane.selectedPaths)}
          onRename={() => selectedEntry && canRename && setRenameItem(selectedEntry)}
          onUploadFiles={upload.openFiles}
          onUploadFolder={upload.openFolder}
          position={position}
        />
        {upload.inputs}
      </div>
      {children}
      {isNewFolderDialogOpen ? <NewFolderDialog isLocked={isOperationLocked} onClose={() => setIsNewFolderDialogOpen(false)} parentPath={pane.path} /> : null}
      {renameItem ? (
        <RenameDialog isLocked={isOperationLocked} item={renameItem} onClose={() => setRenameItem(undefined)} onSuccess={onClearSelection} />
      ) : null}
      {deletePaths ? (
        <DeleteConfirmationDialog isLocked={isOperationLocked} onClose={() => setDeletePaths(undefined)} onFinish={onClearSelection} paths={deletePaths} />
      ) : null}
      {upload.dialog}
    </>
  )
}
