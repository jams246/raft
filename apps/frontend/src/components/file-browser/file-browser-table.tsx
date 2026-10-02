import { FileBrowserEntry } from './file-browser-entry'
import type { FileBrowserListingProps } from './file-browser-listing'

type FileBrowserTableProps = Pick<
  FileBrowserListingProps,
  'path' | 'sortColumn' | 'sortDirection' | 'isFrozen' | 'isNavigationOnly' | 'onSort' | 'entries' | 'selectedPaths' | 'onNavigate' | 'onSelect'
>

export function FileBrowserTable({
  path,
  sortColumn,
  sortDirection,
  isFrozen,
  isNavigationOnly,
  onSort,
  entries,
  selectedPaths,
  onNavigate,
  onSelect
}: FileBrowserTableProps) {
  const ariaSortDirection = sortDirection === 'asc' ? 'ascending' : 'descending'
  const sortIndicator = sortDirection === 'asc' ? '↑' : '↓'
  return (
    <table aria-label={`Files in ${path}`} className="file-browser__table">
      <thead>
        <tr>
          <th aria-sort={sortColumn === 'name' ? ariaSortDirection : 'none'} className="file-browser__heading" scope="col">
            <button className="file-browser__sort-button" disabled={isFrozen || isNavigationOnly} onClick={() => onSort('name')} type="button">
              Name {sortColumn === 'name' ? sortIndicator : ''}
            </button>
          </th>
          <th aria-sort={sortColumn === 'size' ? ariaSortDirection : 'none'} className="file-browser__heading file-browser__size-heading" scope="col">
            <button className="file-browser__sort-button" disabled={isFrozen || isNavigationOnly} onClick={() => onSort('size')} type="button">
              Size {sortColumn === 'size' ? sortIndicator : ''}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <FileBrowserEntry
            entry={entry}
            isSelected={selectedPaths.has(entry.path)}
            isSelectable={!isFrozen && !isNavigationOnly}
            isNavigable={!isFrozen}
            key={entry.path}
            onOpenDirectory={onNavigate}
            onSelect={onSelect}
          />
        ))}
      </tbody>
    </table>
  )
}
