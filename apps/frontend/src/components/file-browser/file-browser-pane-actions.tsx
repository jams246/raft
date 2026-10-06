'use client'

import type { FileEntry } from '@raft/shared'
import { useRef, useState } from 'react'
import { downloadSelection } from '../file-operations/file-browser-download'
import { FileBrowserPaneActionToolbar } from './file-browser-pane-action-toolbar'
import { FileBrowserPaneDialogs } from './file-browser-pane-dialogs'
import type { FileBrowserPaneActionsProps } from './file-browser-pane-actions.types'

export type { FileBrowserPaneActionsProps } from './file-browser-pane-actions.types'

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
  const focusReturnRef = useRef<HTMLElement | null>(null)
  const returnFocus = () => {
    const target = focusReturnRef.current
    if (target?.isConnected && !target.matches(':disabled')) target.focus()
  }
  return (
    <>
      <FileBrowserPaneActionToolbar
        entries={entries}
        hasError={hasError}
        isHidden={isHidden}
        isLoading={isLoading}
        isOperationLocked={isOperationLocked}
        isTransferDestinationAllowed={isTransferDestinationAllowed}
        onCloseAutoFocus={returnFocus}
        onCopy={onCopy}
        onCreateFolder={() => setIsNewFolderDialogOpen(true)}
        onDelete={() => setDeletePaths(pane.selectedPaths)}
        onDialogTriggerFocus={(button) => {
          focusReturnRef.current = button
        }}
        onDownload={() => downloadSelection(pane.selectedPaths)}
        onMove={onMove}
        onRename={setRenameItem}
        onUploadError={onUploadError}
        onUploadRequestFinished={onUploadRequestFinished}
        onUploadRequestStarted={onUploadRequestStarted}
        pane={pane}
        position={position}
      />
      {children}
      <FileBrowserPaneDialogs
        deletePaths={deletePaths}
        isLocked={isOperationLocked}
        newFolderOpen={isNewFolderDialogOpen}
        onCloseAutoFocus={returnFocus}
        onDeleteFinish={onClearSelection}
        onDeleteOpenChange={(open) => {
          if (!open) setDeletePaths(undefined)
        }}
        onNewFolderOpenChange={setIsNewFolderDialogOpen}
        onRenameOpenChange={(open) => {
          if (!open) setRenameItem(undefined)
        }}
        onRenameSuccess={onClearSelection}
        parentPath={pane.path}
        renameItem={renameItem}
      />
    </>
  )
}
