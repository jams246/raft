'use client'

import type { FileEntry } from '@raft/shared'
import { type MouseEvent, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { FileBrowserPaneProps } from './file-browser-pane'
import { type SortColumn, sortFileEntries } from './file-browser-list'
import { navigatePane, selectPaneEntry, sortPane, traversePaneHistory } from './file-browser-pane-state'
import { useDirectoryListing } from './use-directory-listing'

const BACK_MOUSE_BUTTON = 3

const FORWARD_MOUSE_BUTTON = 4

type PaneInteractionOptions = Pick<
  FileBrowserPaneProps,
  'pane' | 'isFrozen' | 'isNavigationOnly' | 'onChangePane' | 'onDirectoryNotFound' | 'onRegisterListingRefresh'
>

export function useFileBrowserPane({ pane, isFrozen, isNavigationOnly, onChangePane, onDirectoryNotFound, onRegisterListingRefresh }: PaneInteractionOptions) {
  const paneRef = useRef<HTMLElement>(null)
  const { listing, isLoading, hasError, missingPath, refresh } = useDirectoryListing(pane.path)
  const entries = listing?.entries ?? EMPTY_ENTRIES
  const sortedEntries = useMemo(() => sortFileEntries(entries, pane.sortColumn, pane.sortDirection), [entries, pane.sortColumn, pane.sortDirection])
  const selectedPathSet = useMemo(() => new Set(pane.selectedPaths), [pane.selectedPaths])
  const isEmpty = pane.path === '/' ? !entries.some((entry) => entry.type === 'directory') : entries.length === 0
  useLayoutEffect(() => {
    paneRef.current?.scrollTo(0, 0)
    // Navigation resets scroll even though scrolling does not read the path.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [pane.path])
  useLayoutEffect(() => {
    onRegisterListingRefresh(pane.id, pane.path, refresh)
    return () => onRegisterListingRefresh(pane.id, pane.path)
  }, [onRegisterListingRefresh, pane.id, pane.path, refresh])

  useEffect(() => {
    if (missingPath === pane.path && pane.path !== '/') onDirectoryNotFound(pane.id, pane.path)
  }, [missingPath, onDirectoryNotFound, pane.id, pane.path])

  function clearSelection() {
    if (isFrozen || isNavigationOnly) return
    onChangePane((currentPane) => ({ ...currentPane, selectedPaths: [], selectionAnchor: undefined }))
  }

  function navigateTo(nextPath: string) {
    if (isFrozen) return
    onChangePane((currentPane) => navigatePane(currentPane, nextPath))
  }

  function handleHistoryButton(event: MouseEvent<HTMLElement>) {
    if (event.button !== BACK_MOUSE_BUTTON && event.button !== FORWARD_MOUSE_BUTTON) return
    event.preventDefault()
    event.stopPropagation()
    if (isFrozen || event.type !== 'mouseup') return
    const direction = event.button === BACK_MOUSE_BUTTON ? -1 : 1
    onChangePane((currentPane) => traversePaneHistory(currentPane, direction))
  }

  function changeSort(column: SortColumn) {
    if (isFrozen) return
    onChangePane((currentPane) => sortPane(currentPane, column))
  }

  function selectEntry(entry: FileEntry, event: MouseEvent<HTMLTableRowElement>) {
    if (isFrozen || isNavigationOnly || entry.type === 'unsupported') return
    const { shiftKey, ctrlKey, metaKey } = event
    onChangePane((currentPane) => selectPaneEntry(currentPane, sortedEntries, entry.path, { shiftKey, ctrlKey, metaKey }))
  }

  return {
    paneRef,
    listing,
    isLoading,
    hasError,
    refresh,
    entries,
    sortedEntries,
    selectedPathSet,
    isEmpty,
    clearSelection,
    navigateTo,
    handleHistoryButton,
    changeSort,
    selectEntry
  }
}

const EMPTY_ENTRIES: FileEntry[] = []
