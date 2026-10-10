'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { type FileBrowserPaneState, createFileBrowserPaneState } from './file-browser-pane-state'

export function resetMissingPane(pane: FileBrowserPaneState, path: string): FileBrowserPaneState {
  if (pane.path !== path) return pane
  return { ...pane, path: '/', history: ['/'], historyIndex: 0, selectedPaths: [], selectionAnchor: undefined }
}

export function useFileBrowserLayout() {
  const [panes, setPanes] = useState(() => [createFileBrowserPaneState(0, '/')])
  const mostRecentlyInteractedPaneId = useRef(0)
  const nextPaneId = useRef(1)

  useEffect(() => {
    try {
      if (localStorage.getItem('raft:dual-pane') !== 'true') return
      nextPaneId.current = 2
      // oxlint-disable-next-line react/set-state-in-effect -- Restore browser-only storage after hydration to keep server markup consistent.
      setPanes([createFileBrowserPaneState(0, '/'), createFileBrowserPaneState(1, '/')])
    } catch {
      // Browser storage may be blocked; keep the default layout.
    }
  }, [])

  const createPane = useCallback((path: string) => createFileBrowserPaneState(nextPaneId.current++, path), [])

  function toggleDualPane(isDualPane: boolean) {
    try {
      localStorage.setItem('raft:dual-pane', String(!isDualPane))
    } catch {
      // Keep toggling available when browser storage is blocked.
    }

    if (!isDualPane) {
      setPanes([...panes, createPane(panes[0]?.path ?? '/')])
      return
    }

    const retainedPane = panes.find((pane) => pane.id === mostRecentlyInteractedPaneId.current) ?? panes[0]
    if (retainedPane === undefined) return
    setPanes([retainedPane])
    mostRecentlyInteractedPaneId.current = retainedPane.id
  }

  const recoverPaneDirectory = useCallback((paneId: number, path: string) => {
    setPanes((currentPanes) => currentPanes.map((pane) => (pane.id === paneId ? resetMissingPane(pane, path) : pane)))
  }, [])

  return { panes, setPanes, mostRecentlyInteractedPaneId, createPane, toggleDualPane, recoverPaneDirectory }
}
