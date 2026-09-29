'use client'

import { useState } from 'react'

interface FileBrowserToolbarProps {
  canUpload: boolean
  canCreateFolder: boolean
  canDelete: boolean
  canDownload: boolean
  canRename: boolean
  isOperationLocked: boolean
  onCreateFolder: () => void
  onDelete: () => void
  onDownload: () => void
  onRename: () => void
  onUploadFiles: () => void
  onUploadFolder: () => void
}

export function FileBrowserToolbar({
  canUpload,
  canCreateFolder,
  canDelete,
  canDownload,
  canRename,
  isOperationLocked,
  onCreateFolder,
  onDelete,
  onDownload,
  onRename,
  onUploadFiles,
  onUploadFolder
}: FileBrowserToolbarProps) {
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false)

  const actions = [
    { label: 'Download', disabled: !canDownload, onClick: onDownload },
    { label: 'Copy', disabled: true },
    { label: 'Move', disabled: true },
    { label: 'Rename', disabled: isOperationLocked || !canRename, onClick: onRename },
    { label: 'New Folder', disabled: isOperationLocked || !canCreateFolder, onClick: onCreateFolder },
    { label: 'Delete', disabled: isOperationLocked || !canDelete, onClick: onDelete }
  ]

  return (
    <div aria-label="File actions" className="file-browser__toolbar">
      <div className="file-browser__upload-control">
        <button
          aria-expanded={isUploadMenuOpen}
          aria-haspopup="true"
          disabled={!canUpload || isOperationLocked}
          onClick={() => setIsUploadMenuOpen((isOpen) => !isOpen)}
          type="button"
        >
          Upload
        </button>
        {isUploadMenuOpen ? (
          <div aria-label="Upload options" className="file-browser__upload-menu">
            <button
              disabled={!canUpload || isOperationLocked}
              onClick={() => {
                setIsUploadMenuOpen(false)
                onUploadFiles()
              }}
              type="button"
            >
              Files…
            </button>
            <button
              disabled={!canUpload || isOperationLocked}
              onClick={() => {
                setIsUploadMenuOpen(false)
                onUploadFolder()
              }}
              type="button"
            >
              Folder…
            </button>
          </div>
        ) : null}
      </div>
      {actions.map((action) => (
        <button disabled={action.disabled} key={action.label} onClick={action.onClick} type="button">
          {action.label}
        </button>
      ))}
    </div>
  )
}
