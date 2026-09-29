interface FileBrowserToolbarProps {
  canCreateFolder: boolean
  canRename: boolean
  onCreateFolder: () => void
  onRename: () => void
}

export function FileBrowserToolbar({ canCreateFolder, canRename, onCreateFolder, onRename }: FileBrowserToolbarProps) {
  const actions = [
    { label: 'Upload', disabled: true },
    { label: 'Download', disabled: true },
    { label: 'Copy', disabled: true },
    { label: 'Move', disabled: true },
    { label: 'Rename', disabled: !canRename, onClick: onRename },
    { label: 'New Folder', disabled: !canCreateFolder, onClick: onCreateFolder },
    { label: 'Delete', disabled: true }
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
