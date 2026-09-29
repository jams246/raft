import type { SortColumn, SortDirection } from './file-browser-list'

export interface FileBrowserPaneState {
  id: number
  path: string
  selectedPaths: string[]
  selectionAnchor: string | undefined
  sortColumn: SortColumn
  sortDirection: SortDirection
  hasSorted: boolean
}

export function createFileBrowserPaneState(id: number, path: string): FileBrowserPaneState {
  return { id, path, selectedPaths: [], selectionAnchor: undefined, sortColumn: 'name', sortDirection: 'asc', hasSorted: false }
}
