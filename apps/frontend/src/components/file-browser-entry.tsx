import type { FileEntry } from '@raft/shared'
import type { MouseEvent } from 'react'
import { formatFileSize } from './file-browser-list'

interface FileBrowserEntryProps {
  entry: FileEntry
  isSelected: boolean
  onOpenDirectory: (path: string) => void
  onSelect: (entry: FileEntry, event: MouseEvent<HTMLTableRowElement>) => void
}

export function FileBrowserEntry({ entry, isSelected, onOpenDirectory, onSelect }: FileBrowserEntryProps) {
  let icon = '⚠'
  if (entry.type === 'directory') icon = '📁'
  if (entry.type === 'file') icon = '📄'
  const rowClasses = ['file-browser__entry']
  if (entry.type === 'unsupported') rowClasses.push('file-browser__entry--unsupported')
  if (isSelected) rowClasses.push('file-browser__entry--selected')

  return (
    <tr
      className={rowClasses.join(' ')}
      onClick={(event) => onSelect(entry, event)}
      onDoubleClick={() => {
        if (entry.type === 'directory') onOpenDirectory(entry.path)
      }}
    >
      <td>
        {entry.type === 'unsupported' ? (
          <>
            <span aria-hidden="true">{icon}</span> {entry.name}
            <span className="file-browser__status"> Unsupported</span>
          </>
        ) : (
          <button aria-pressed={isSelected} className="file-browser__entry-button" type="button">
            <span aria-hidden="true">{icon}</span> {entry.name}
          </button>
        )}
      </td>
      <td className="file-browser__size">{entry.type === 'file' && entry.size !== undefined ? formatFileSize(entry.size) : '-'}</td>
    </tr>
  )
}
