'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

interface FileBrowserToolbarProps {
  position: 'left' | 'right'
  canUpload: boolean
  canCreateFolder: boolean
  canDelete: boolean
  canDownload: boolean
  canTransfer: boolean
  canRename: boolean
  isOperationLocked: boolean
  onCreateFolder: () => void
  onDelete: () => void
  onDownload: () => void
  onCopy: () => void
  onMove: () => void
  onRename: () => void
  onUploadFiles: () => void
  onUploadFolder: () => void
  onDialogTriggerFocus: (button: HTMLButtonElement) => void
}

export function FileBrowserToolbar({
  position,
  canUpload,
  canCreateFolder,
  canDelete,
  canDownload,
  canTransfer,
  canRename,
  isOperationLocked,
  onCreateFolder,
  onDelete,
  onDownload,
  onCopy,
  onMove,
  onRename,
  onUploadFiles,
  onUploadFolder,
  onDialogTriggerFocus
}: FileBrowserToolbarProps) {
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false)
  useEffect(() => {
    if (isOperationLocked) {
      // oxlint-disable-next-line react/set-state-in-effect -- Close the menu on an external operation lock.
      setIsUploadMenuOpen(false)
    }
  }, [isOperationLocked])
  const copyLabel = position === 'left' ? 'Copy →' : '← Copy'
  const moveLabel = position === 'left' ? 'Move →' : '← Move'

  const actions = [
    { label: 'Download', disabled: !canDownload, onClick: onDownload },
    { label: copyLabel, disabled: isOperationLocked || !canTransfer, onClick: onCopy },
    { label: moveLabel, disabled: isOperationLocked || !canTransfer, onClick: onMove },
    { label: 'Rename', disabled: isOperationLocked || !canRename, onClick: onRename },
    { label: 'New Folder', disabled: isOperationLocked || !canCreateFolder, onClick: onCreateFolder },
    { label: 'Delete', disabled: isOperationLocked || !canDelete, onClick: onDelete }
  ]

  return (
    <div aria-label="File actions" className="flex flex-wrap items-center gap-2 border-b border-divider px-5 py-3">
      <DropdownMenu open={isUploadMenuOpen} onOpenChange={setIsUploadMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            className="[@media(max-width:600px)]:[flex:1_1_40%]"
            disabled={!canUpload || isOperationLocked}
            onFocus={(event) => onDialogTriggerFocus(event.currentTarget)}
            variant="outline"
          >
            Upload
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" aria-label="Upload options" className="min-w-40 border border-border bg-popover text-popover-foreground">
          <DropdownMenuItem disabled={!canUpload || isOperationLocked} onSelect={onUploadFiles}>
            Files…
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canUpload || isOperationLocked} onSelect={onUploadFolder}>
            Folder…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {actions.map((action) => (
        <Button
          className="[@media(max-width:600px)]:[flex:1_1_40%]"
          disabled={action.disabled}
          key={action.label}
          onClick={action.onClick}
          onFocus={(event) => onDialogTriggerFocus(event.currentTarget)}
          variant="outline"
        >
          {action.label}
        </Button>
      ))}
    </div>
  )
}
