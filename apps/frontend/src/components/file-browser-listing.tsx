'use client'

import type { DirectoryListing, FileEntry } from '@raft/shared'
import type { MouseEvent } from 'react'
import { FileBrowserEntry } from './file-browser-entry'
import type { SortColumn, SortDirection } from './file-browser-list'

interface FileBrowserListingProps {
  path: string
  listing?: DirectoryListing
  entries: FileEntry[]
  selectedPaths: Set<string>
  isLoading: boolean
  hasError: boolean
  isEmpty: boolean
  sortColumn: SortColumn
  sortDirection: SortDirection
  onRetry: () => void
  onNavigate: (path: string) => void
  onSelect: (entry: FileEntry, event: MouseEvent<HTMLTableRowElement>) => void
  onClearSelection: () => void
  onSort: (column: SortColumn) => void
}

export function FileBrowserListing({
  path,
  listing,
  entries,
  selectedPaths,
  isLoading,
  hasError,
  isEmpty,
  sortColumn,
  sortDirection,
  onRetry,
  onNavigate,
  onSelect,
  onClearSelection,
  onSort
}: FileBrowserListingProps) {
  const ariaSortDirection = sortDirection === 'asc' ? 'ascending' : 'descending'
  const sortIndicator = sortDirection === 'asc' ? '↑' : '↓'
  return (
    /* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- Blank-space clicks clear selection; row buttons remain keyboard accessible. */
    <section
      aria-label="Files"
      className="file-browser__list"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('tr')) return
        onClearSelection()
      }}
    >
      {isLoading ? (
        <p aria-live="polite" className="file-browser__empty">
          Loading directory…
        </p>
      ) : null}
      {hasError ? (
        <div className="file-browser__empty" role="alert">
          <p>Unable to load this directory. Check the server connection and try again.</p>
          <button onClick={onRetry} type="button">
            Try again
          </button>
        </div>
      ) : null}
      {listing && !isLoading && !hasError ? (
        <>
          <table aria-label={`Files in ${path}`} className="file-browser__table">
            <thead>
              <tr>
                <th aria-sort={sortColumn === 'name' ? ariaSortDirection : 'none'} className="file-browser__heading" scope="col">
                  <button className="file-browser__sort-button" onClick={() => onSort('name')} type="button">
                    Name {sortColumn === 'name' ? sortIndicator : ''}
                  </button>
                </th>
                <th aria-sort={sortColumn === 'size' ? ariaSortDirection : 'none'} className="file-browser__heading file-browser__size-heading" scope="col">
                  <button className="file-browser__sort-button" onClick={() => onSort('size')} type="button">
                    Size {sortColumn === 'size' ? sortIndicator : ''}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <FileBrowserEntry entry={entry} isSelected={selectedPaths.has(entry.path)} key={entry.path} onOpenDirectory={onNavigate} onSelect={onSelect} />
              ))}
            </tbody>
          </table>
          {isEmpty ? (
            <div className="file-browser__empty">
              {path === '/' ? (
                <>
                  <p>No folders available.</p>
                  <p>Mount one or more directories under /data to make them available here.</p>
                </>
              ) : (
                <p>This directory is empty.</p>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
