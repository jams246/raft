import { basename, dirname } from 'node:path'
import type { StreamingCapacityGuard } from './streaming-capacity-guard.js'
import { PathResolver } from './path-resolver.js'
import type { SupportedTreeEntry } from './path-resolver.js'
import type { ResolvedPath } from '../Domain/models.js'
import type { CopyMoveTreeEntry } from '../Application/copy-move-models.js'
import { promotePreparedReplacement, unusedInternalPath } from './prepared-replacement.js'
import type { PreparedDestination } from './prepared-replacement.js'
import { type PreparedCopyOutput, cleanupPreparedCopy, copyPreparedFiles, createPreparedDirectories, restoreDirectoryModes } from './copy-output.js'

const paths = new PathResolver()

export interface PreparedCopySource {
  source: ResolvedPath
  entries: CopyMoveTreeEntry[]
  bytes: number
}

export async function prepareCopySources(
  sources: ResolvedPath[],
  onPreparing: (name: string) => void,
  signal: AbortSignal
): Promise<{ sources: PreparedCopySource[]; bytesTotal: number | null }> {
  const prepared: PreparedCopySource[] = []
  let bytesTotal = 0
  let isTotalKnown = true

  for (const source of sources) {
    signal.throwIfAborted()
    onPreparing(basename(source.virtualPath))
    const entries = (await paths.listSupportedTree(source, signal)).map(toCopyEntry)
    const size = getContentSize(entries)
    prepared.push({ source, entries, bytes: size.bytes })
    if (size.bytesTotal === null) isTotalKnown = false
    else bytesTotal += size.bytesTotal
    if (!Number.isSafeInteger(bytesTotal)) isTotalKnown = false
  }

  return { sources: prepared, bytesTotal: isTotalKnown ? bytesTotal : null }
}

export async function copyPreparedItem(
  source: PreparedCopySource,
  target: PreparedDestination,
  operationId: string,
  index: number,
  signal: AbortSignal,
  capacity: StreamingCapacityGuard,
  reportBytes: (bytesWritten: number) => void,
  invalidateTotal: () => void,
  enterFinalizing: () => void
): Promise<{ bytesWritten: number; cleanupFailure: Awaited<ReturnType<typeof promotePreparedReplacement>>; matchesPreparedSize: boolean }> {
  const sourceBytes = source.entries.reduce((total, entry) => total + (entry.isDirectory ? 0n : BigInt(entry.size)), 0n)
  await capacity.checkBeforeOutput(sourceBytes)
  const output: PreparedCopyOutput = {
    preparedPath: await unusedInternalPath(dirname(target.path), 'tmp', operationId, index + 1),
    sourceBytes,
    bytesWritten: 0,
    itemBytesAccepted: 0n,
    ownsPreparedPath: false,
    signal,
    capacity,
    reportBytes,
    invalidateTotal
  }
  const directories = source.entries.filter((entry) => entry.isDirectory)
  try {
    await createPreparedDirectories(directories, output)
    await copyPreparedFiles(source.entries, source.source.isDirectory, output)
    signal.throwIfAborted()
    const currentEntries = (await paths.listSupportedTree(source.source, signal)).map(toCopyEntry)
    const matchesPreparedSize = hasSamePreparedSource(source.entries, currentEntries, true)
    if (!matchesPreparedSize) invalidateTotal()
    enterFinalizing()
    await restoreDirectoryModes(directories.toReversed(), output.preparedPath)
    signal.throwIfAborted()
    const cleanupFailure = await promotePreparedReplacement(output.preparedPath, target, operationId, index)
    return { bytesWritten: output.bytesWritten, cleanupFailure, matchesPreparedSize }
  } catch (error) {
    throw await cleanupPreparedCopy(directories, output, error)
  }
}

function hasSamePreparedSource(expected: CopyMoveTreeEntry[], observed: CopyMoveTreeEntry[], compareMetadata: boolean): boolean {
  return (
    expected.length === observed.length &&
    expected.every((entry, index) => {
      const current = observed[index]
      return (
        entry.relativePath === current.relativePath &&
        entry.isDirectory === current.isDirectory &&
        entry.size === current.size &&
        (!compareMetadata || (entry.dev === current.dev && entry.ino === current.ino && entry.mtimeMs === current.mtimeMs && entry.ctimeMs === current.ctimeMs))
      )
    })
  )
}

function getContentSize(entries: CopyMoveTreeEntry[]): { bytes: number; bytesTotal: number | null } {
  let bytes = 0
  let isTotalKnown = true
  for (const entry of entries) {
    if (entry.isDirectory) continue
    const size = entry.size
    if (!Number.isFinite(size) || size < 0) {
      isTotalKnown = false
      continue
    }
    const nextBytes = bytes + size
    if (!Number.isFinite(nextBytes)) {
      isTotalKnown = false
      continue
    }
    bytes = nextBytes
    if (!Number.isSafeInteger(bytes)) isTotalKnown = false
  }
  return { bytes, bytesTotal: isTotalKnown ? bytes : null }
}

export async function measureMovedSource(
  source: PreparedCopySource,
  targetPath: string,
  compareMetadata = false
): Promise<{ bytes: number; bytesTotal: number | null; matchesPreparedSize: boolean }> {
  try {
    const entries = (await paths.listSupportedTree({ ...source.source, absolutePath: targetPath })).map(toCopyEntry)
    const size = getContentSize(entries)
    const matchesPreparedSize = hasSamePreparedSource(source.entries, entries, compareMetadata)
    return { ...size, matchesPreparedSize }
  } catch {
    return { bytes: source.bytes, bytesTotal: null, matchesPreparedSize: false }
  }
}

function toCopyEntry(entry: SupportedTreeEntry): CopyMoveTreeEntry {
  return {
    absolutePath: entry.absolutePath,
    relativePath: entry.relativePath,
    isDirectory: entry.isDirectory,
    size: entry.stats.size,
    mode: entry.stats.mode,
    dev: entry.stats.dev,
    ino: entry.stats.ino,
    mtimeMs: entry.stats.mtimeMs,
    ctimeMs: entry.stats.ctimeMs
  }
}
