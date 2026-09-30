import type { Failure } from '../../shared/failures.js'
import type { ResolvedPath } from '../Domain/models.js'

export interface CopyMoveTreeEntry {
  absolutePath: string
  relativePath: string
  isDirectory: boolean
  size: number
  mode: number
  dev: number
  ino: number
  mtimeMs: number
  ctimeMs: number
}

export interface CopyMoveItem {
  source: ResolvedPath
  entries: CopyMoveTreeEntry[]
  bytes: number
  target: { name: string; path: string; existing: boolean }
}

export interface CopyMovePlan {
  items: CopyMoveItem[]
  bytesTotal: number | null
}

export interface CopyMoveResult {
  bytesWritten: number
  bytesTotal: number | null
  cleanupFailure?: Failure
  matchesPreparedSize: boolean
}
