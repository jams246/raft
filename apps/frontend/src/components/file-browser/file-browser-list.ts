import type { FileEntry } from '@raft/shared'

export type SortColumn = 'name' | 'size'
export type SortDirection = 'asc' | 'desc'

const sizeUnits = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
const sizeFormatter = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })

export function formatFileSize(size: number): string {
  let value = size
  let unitIndex = 0

  while (value >= 1024 && unitIndex < sizeUnits.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${sizeFormatter.format(value)} ${sizeUnits[unitIndex]}`
}

export function sortFileEntries(entries: FileEntry[], column: SortColumn, direction: SortDirection): FileEntry[] {
  const sortMultiplier = direction === 'asc' ? 1 : -1

  return entries.toSorted((left, right) => {
    const leftIsDirectory = left.type === 'directory'
    const rightIsDirectory = right.type === 'directory'
    if (leftIsDirectory !== rightIsDirectory) return leftIsDirectory ? -1 : 1

    if (column === 'size' && !leftIsDirectory) {
      if (left.type === 'unsupported') {
        return right.type === 'unsupported' ? left.name.localeCompare(right.name) : 1
      }
      if (right.type === 'unsupported') return -1

      const sizeDifference = (left.size ?? 0) - (right.size ?? 0)
      return (sizeDifference || left.name.localeCompare(right.name)) * sortMultiplier
    }

    const nameMultiplier = column === 'name' ? sortMultiplier : 1
    return left.name.localeCompare(right.name) * nameMultiplier
  })
}

export function getSelectableRangePaths(entries: FileEntry[], anchorPath: string | undefined, targetPath: string): string[] {
  const anchorIndex = entries.findIndex((entry) => entry.path === anchorPath)
  const targetIndex = entries.findIndex((entry) => entry.path === targetPath)
  if (anchorIndex < 0 || targetIndex < 0) return [targetPath]

  return entries
    .slice(Math.min(anchorIndex, targetIndex), Math.max(anchorIndex, targetIndex) + 1)
    .filter((entry) => entry.type !== 'unsupported')
    .map((entry) => entry.path)
}
