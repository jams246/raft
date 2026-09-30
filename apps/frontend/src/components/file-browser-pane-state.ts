import type { SortColumn, SortDirection } from './file-browser-list'

export interface FileBrowserPaneState {
  id: number
  path: string
  history: string[]
  historyIndex: number
  selectedPaths: string[]
  selectionAnchor: string | undefined
  sortColumn: SortColumn
  sortDirection: SortDirection
  hasSorted: boolean
}

export function createFileBrowserPaneState(id: number, path: string): FileBrowserPaneState {
  return {
    id,
    path,
    history: [path],
    historyIndex: 0,
    selectedPaths: [],
    selectionAnchor: undefined,
    sortColumn: 'name',
    sortDirection: 'asc',
    hasSorted: false
  }
}

export function navigatePane(pane: FileBrowserPaneState, path: string): FileBrowserPaneState {
  if (path === pane.path) return pane
  const history = [...pane.history.slice(0, pane.historyIndex + 1), path]
  return { ...pane, path, history, historyIndex: history.length - 1, selectedPaths: [], selectionAnchor: undefined }
}

export function traversePaneHistory(pane: FileBrowserPaneState, direction: number): FileBrowserPaneState {
  const historyIndex = pane.historyIndex + direction
  if (historyIndex < 0 || historyIndex >= pane.history.length) return pane
  return { ...pane, path: pane.history[historyIndex], historyIndex, selectedPaths: [], selectionAnchor: undefined }
}
