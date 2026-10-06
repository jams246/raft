import type { FileEntry } from '@raft/shared'
import { canDownloadSelection } from '../file-operations/file-browser-download'

interface FileBrowserActionAvailabilityOptions {
  path: string
  entries: FileEntry[]
  selectedPaths: string[]
  isLoading: boolean
  hasError: boolean
  isTransferDestinationAllowed: boolean
}

export function getFileBrowserActionAvailability({
  path,
  entries,
  selectedPaths,
  isLoading,
  hasError,
  isTransferDestinationAllowed
}: FileBrowserActionAvailabilityOptions) {
  const selectedEntry = selectedPaths.length === 1 ? entries.find((entry) => entry.path === selectedPaths[0]) : undefined
  const canDownload = !isLoading && !hasError && canDownloadSelection(entries, selectedPaths)
  const canRename = path !== '/' && Boolean(selectedEntry && selectedEntry.type !== 'unsupported' && !selectedEntry.protectedRoot)
  const canDelete =
    path !== '/' &&
    selectedPaths.length > 0 &&
    selectedPaths.every((selectedPath) => entries.some((entry) => entry.path === selectedPath && entry.type !== 'unsupported' && !entry.protectedRoot))

  return {
    selectedEntry,
    canDownload,
    canRename,
    canDelete,
    canTransfer: canDelete && isTransferDestinationAllowed && !isLoading && !hasError
  }
}
