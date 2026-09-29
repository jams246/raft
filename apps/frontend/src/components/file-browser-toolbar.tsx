interface FileBrowserToolbarProps {
  canCreateFolder: boolean
  canDelete: boolean
  canDownload: boolean
  canRename: boolean
  onCreateFolder: () => void
  onDelete: () => void
  onDownload: () => void
  onRename: () => void
}

export function FileBrowserToolbar({
  canCreateFolder,
  canDelete,
  canDownload,
  canRename,
  onCreateFolder,
  onDelete,
  onDownload,
  onRename
}: FileBrowserToolbarProps) {
  const actions = [
    { label: 'Upload', disabled: true },
    { label: 'Download', disabled: !canDownload, onClick: onDownload },
    { label: 'Copy', disabled: true },
    { label: 'Move', disabled: true },
    { label: 'Rename', disabled: !canRename, onClick: onRename },
    { label: 'New Folder', disabled: !canCreateFolder, onClick: onCreateFolder },
    { label: 'Delete', disabled: !canDelete, onClick: onDelete }
  ]

  return (
    <div aria-label="File actions" className="file-browser__toolbar">
      {actions.map((action) => (
        <button disabled={action.disabled} key={action.label} onClick={action.onClick} type="button">
          {action.label}
        </button>
      ))}
    </div>
  )
}
