import type { FileEntry } from '@raft/shared'
import type { MouseEvent } from 'react'
import { formatFileSize } from './file-browser-list'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'

interface FileBrowserEntryProps {
  entry: FileEntry
  isSelected: boolean
  isSelectable: boolean
  isNavigable: boolean
  onOpenDirectory: (path: string) => void
  onSelect: (entry: FileEntry, event: MouseEvent<HTMLTableRowElement>) => void
}

export function FileBrowserEntry({ entry, isSelected, isSelectable, isNavigable, onOpenDirectory, onSelect }: FileBrowserEntryProps) {
  let icon = '⚠'
  if (entry.type === 'directory') icon = '📁'
  if (entry.type === 'file') icon = '📄'
  const rowClasses = isSelected ? 'bg-selection text-foreground hover:bg-selection-hover' : ''

  return (
    <TableRow
      aria-selected={isSelected}
      className={rowClasses}
      onClick={(event) => isSelectable && onSelect(entry, event)}
      onDoubleClick={() => {
        if (isNavigable && entry.type === 'directory') onOpenDirectory(entry.path)
      }}
    >
      <TableCell className={`min-w-0 wrap-anywhere whitespace-normal py-2.5 ${entry.type === 'unsupported' ? 'text-muted-foreground' : ''}`}>
        {entry.type === 'unsupported' || (!isSelectable && (!isNavigable || entry.type !== 'directory')) ? (
          <>
            <span aria-hidden="true">{icon}</span> {entry.name}
            {entry.type === 'unsupported' ? <span className="ml-3 text-sm">Unsupported</span> : null}
          </>
        ) : (
          <Button
            aria-pressed={isSelectable ? isSelected : undefined}
            className="h-auto min-h-0 max-w-full justify-start wrap-anywhere whitespace-normal p-0 text-left font-normal hover:bg-transparent"
            onClick={(event) => {
              if (!isSelectable && isNavigable && event.detail === 0) onOpenDirectory(entry.path)
            }}
            variant="ghost"
          >
            <span aria-hidden="true">{icon}</span> {entry.name}
          </Button>
        )}
      </TableCell>
      <TableCell className="w-32 py-2.5 text-right font-mono text-xs text-muted-foreground [@media(max-width:700px)]:w-20">
        {entry.type === 'file' && entry.size !== undefined ? formatFileSize(entry.size) : '-'}
      </TableCell>
    </TableRow>
  )
}
