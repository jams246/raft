'use client'

import type { FileEntry } from '@raft/shared'
import { DeleteConfirmationDialog } from '../file-operations/delete-confirmation-dialog'
import { NewFolderDialog } from '../file-operations/new-folder-dialog'
import { RenameDialog } from '../file-operations/rename-dialog'

interface FileBrowserPaneDialogsProps {
  isLocked: boolean
  parentPath: string
  newFolderOpen: boolean
  renameItem?: FileEntry | undefined
  deletePaths?: string[] | undefined
  onCloseAutoFocus: () => void
  onNewFolderOpenChange: (open: boolean) => void
  onRenameOpenChange: (open: boolean) => void
  onRenameSuccess: () => void
  onDeleteOpenChange: (open: boolean) => void
  onDeleteFinish: () => void
}

export function FileBrowserPaneDialogs({
  isLocked,
  parentPath,
  newFolderOpen,
  renameItem,
  deletePaths,
  onCloseAutoFocus,
  onNewFolderOpenChange,
  onRenameOpenChange,
  onRenameSuccess,
  onDeleteOpenChange,
  onDeleteFinish
}: FileBrowserPaneDialogsProps) {
  return (
    <>
      <NewFolderDialog
        isLocked={isLocked}
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenChange={onNewFolderOpenChange}
        open={newFolderOpen}
        parentPath={parentPath}
      />
      <RenameDialog
        isLocked={isLocked}
        item={renameItem}
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenChange={onRenameOpenChange}
        onSuccess={onRenameSuccess}
        open={Boolean(renameItem)}
      />
      <DeleteConfirmationDialog
        isLocked={isLocked}
        onCloseAutoFocus={onCloseAutoFocus}
        onFinish={onDeleteFinish}
        onOpenChange={onDeleteOpenChange}
        open={deletePaths !== undefined}
        paths={deletePaths ?? []}
      />
    </>
  )
}
