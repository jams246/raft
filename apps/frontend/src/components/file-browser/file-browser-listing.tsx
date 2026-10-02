'use client'

import type { DirectoryListing, FileEntry } from '@raft/shared'
import type { MouseEvent } from 'react'
import { FileBrowserTable } from './file-browser-table'
import type { SortColumn, SortDirection } from './file-browser-list'

export interface FileBrowserListingProps {
  isFrozen?: boolean
  isNavigationOnly?: boolean
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
  isFrozen = false,
  isNavigationOnly = false,
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
  const hasCurrentListing = listing?.path === path
  return (
    /* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- Blank-space clicks clear selection; row buttons remain keyboard accessible. */
    <section
      aria-busy={isLoading}
      aria-label="Files"
      className="file-browser__list"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('tr')) return
        onClearSelection()
      }}
    >
      {isLoading && !hasCurrentListing ? (
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
      {hasCurrentListing && !hasError ? (
        <>
          <FileBrowserTable
            path={path}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            isFrozen={isFrozen}
            isNavigationOnly={isNavigationOnly}
            onSort={onSort}
            entries={entries}
            selectedPaths={selectedPaths}
            onNavigate={onNavigate}
            onSelect={onSelect}
          />
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
