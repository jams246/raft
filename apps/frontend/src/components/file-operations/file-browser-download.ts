import type { FileEntry } from '@raft/shared'

export function canDownloadSelection(entries: FileEntry[], selectedPaths: string[]): boolean {
  return selectedPaths.length > 0 && selectedPaths.every((path) => entries.some((entry) => entry.path === path && entry.type !== 'unsupported'))
}

export function downloadSelection(selectedPaths: string[]): void {
  const query = new URLSearchParams()
  for (const path of selectedPaths) query.append('path', path)
  window.open(`/api/download?${query}`, '_blank', 'noopener')
}
