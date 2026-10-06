'use client'

import type { FileEntry } from '@raft/shared'
import { FileBrowserToolbar } from './file-browser-toolbar'
import { type FileBrowserPaneState } from './file-browser-pane-state'
import { getFileBrowserActionAvailability } from './file-browser-action-availability'
import { useFileBrowserUpload } from '../uploads/use-file-browser-upload'

interface FileBrowserPaneActionToolbarProps {
  pane: FileBrowserPaneState
  position: 'left' | 'right'
  entries: FileEntry[]
  isHidden: boolean
  isLoading: boolean
  hasError: boolean
  isOperationLocked: boolean
  isTransferDestinationAllowed: boolean
  onCreateFolder: () => void
  onDelete: () => void
  onDownload: () => void
  onCopy: (sourcePaths: string[]) => void
  onMove: (sourcePaths: string[]) => void
  onRename: (item: FileEntry) => void
  onUploadError: (error: string) => void
  onUploadRequestStarted: (controller: AbortController) => void
  onUploadRequestFinished: (controller: AbortController, error?: string) => void
  onCloseAutoFocus: () => void
  onDialogTriggerFocus: (button: HTMLButtonElement) => void
}

export function FileBrowserPaneActionToolbar({
  pane,
  position,
  entries,
  isHidden,
  isLoading,
  hasError,
  isOperationLocked,
  isTransferDestinationAllowed,
  onCreateFolder,
  onDelete,
  onDownload,
  onCopy,
  onMove,
  onRename,
  onUploadError,
  onUploadRequestStarted,
  onUploadRequestFinished,
  onCloseAutoFocus,
  onDialogTriggerFocus
}: FileBrowserPaneActionToolbarProps) {
  const upload = useFileBrowserUpload({
    directory: pane.path,
    isOperationLocked,
    onCloseAutoFocus,
    onUploadError,
    onUploadRequestStarted,
    onUploadRequestFinished
  })
  const { selectedEntry, canDownload, canRename, canDelete, canTransfer } = getFileBrowserActionAvailability({
    path: pane.path,
    entries,
    selectedPaths: pane.selectedPaths,
    isLoading,
    hasError,
    isTransferDestinationAllowed
  })

  return (
    <>
      <div hidden={isHidden}>
        <FileBrowserToolbar
          canCreateFolder={pane.path !== '/'}
          canTransfer={canTransfer}
          canDelete={canDelete}
          canDownload={canDownload}
          canRename={canRename}
          canUpload={pane.path !== '/'}
          isOperationLocked={isOperationLocked}
          onCreateFolder={onCreateFolder}
          onCopy={() => canTransfer && onCopy(pane.selectedPaths)}
          onMove={() => canTransfer && onMove(pane.selectedPaths)}
          onDelete={() => canDelete && onDelete()}
          onDownload={() => canDownload && onDownload()}
          onRename={() => selectedEntry && canRename && onRename(selectedEntry)}
          onUploadFiles={upload.openFiles}
          onUploadFolder={upload.openFolder}
          onDialogTriggerFocus={onDialogTriggerFocus}
          position={position}
        />
        {upload.inputs}
      </div>
      {upload.dialog}
    </>
  )
}
