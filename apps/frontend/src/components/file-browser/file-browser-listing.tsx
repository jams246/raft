'use client'

import type { DirectoryListing, FileEntry } from '@raft/shared'
import type { MouseEvent } from 'react'
import { FileBrowserTable } from './file-browser-table'
import type { SortColumn, SortDirection } from './file-browser-list'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

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
      className="flex-1 px-6 pb-6 [@media(max-width:700px)]:px-3 [@media(max-width:700px)]:pb-4"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('tr')) return
        onClearSelection()
      }}
    >
      {isLoading && !hasCurrentListing ? (
        <p aria-live="polite" className="py-2 text-sm text-muted-foreground">
          Loading directory…
        </p>
      ) : null}
      {hasError ? (
        <Alert className="mt-3 border-destructive text-destructive" variant="destructive">
          <AlertDescription>Unable to load this directory. Check the server connection and try again.</AlertDescription>
          <Button onClick={onRetry} variant="outline">
            Try again
          </Button>
        </Alert>
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
            <div className="py-3 text-sm text-muted-foreground">
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
