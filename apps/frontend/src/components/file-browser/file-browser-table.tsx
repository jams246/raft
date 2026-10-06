import { FileBrowserEntry } from './file-browser-entry'
import type { FileBrowserListingProps } from './file-browser-listing'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'

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
    <Table aria-label={`Files in ${path}`} className="w-full border-collapse">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead
            aria-sort={sortColumn === 'name' ? ariaSortDirection : 'none'}
            className="w-auto border-b border-border py-2 text-xs font-medium tracking-wide text-muted-foreground"
            scope="col"
          >
            <Button
              className="h-auto min-h-0 p-0 text-left font-normal"
              disabled={isFrozen || isNavigationOnly}
              onClick={() => onSort('name')}
              size="sm"
              variant="ghost"
            >
              Name {sortColumn === 'name' ? sortIndicator : ''}
            </Button>
          </TableHead>
          <TableHead
            aria-sort={sortColumn === 'size' ? ariaSortDirection : 'none'}
            className="w-32 border-b border-border py-2 text-right text-xs font-medium tracking-wide text-muted-foreground [@media(max-width:700px)]:w-20"
            scope="col"
          >
            <Button
              className="ml-auto h-auto min-h-0 p-0 text-right font-normal"
              disabled={isFrozen || isNavigationOnly}
              onClick={() => onSort('size')}
              size="sm"
              variant="ghost"
            >
              Size {sortColumn === 'size' ? sortIndicator : ''}
            </Button>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
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
      </TableBody>
    </Table>
  )
}
