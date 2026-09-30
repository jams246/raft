import { constants } from 'node:fs'
import { chmod, lstat, mkdir, open, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { HttpStatus } from '@nestjs/common'
import { ApiException } from '../api/api-exception.js'
import { toFilesystemException } from './errors.js'
import { listSupportedTree } from './paths.js'
import type { SupportedTreeEntry, ValidatedPath } from './paths.js'
import { promotePreparedReplacement, unusedInternalPath } from './prepared-replacement.js'
import type { PreparedDestination } from './prepared-replacement.js'

export interface PreparedCopySource {
  source: ValidatedPath
  entries: SupportedTreeEntry[]
  bytes: number
}

export async function prepareCopySources(
  sources: ValidatedPath[],
  onPreparing: (name: string) => void,
  signal: AbortSignal
): Promise<{ sources: PreparedCopySource[]; bytesTotal: number | null }> {
  const prepared: PreparedCopySource[] = []
  let bytesTotal = 0
  let isTotalKnown = true

  for (const source of sources) {
    signal.throwIfAborted()
    onPreparing(basename(source.virtualPath))
    const entries = await listSupportedTree(source, signal)
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
  reportBytes: (bytesWritten: number) => void,
  invalidateTotal: () => void,
  enterFinalizing: () => void
): Promise<{ bytesWritten: number; cleanupFailure: Awaited<ReturnType<typeof promotePreparedReplacement>>; matchesPreparedSize: boolean }> {
  const preparedPath = await unusedInternalPath(dirname(target.path), 'tmp', operationId, index + 1)
  const directories = source.entries.filter((entry) => entry.isDirectory)
  let bytesWritten = 0
  let ownsPreparedPath = false

  try {
    for (const entry of directories) {
      signal.throwIfAborted()
      const destinationPath = join(preparedPath, entry.relativePath)
      const currentStats = await lstat(entry.absolutePath)
      if (currentStats.isSymbolicLink() || !currentStats.isDirectory()) {
        throw new ApiException('unsupported', 'The requested path is unsupported.', HttpStatus.BAD_REQUEST)
      }
      await mkdir(destinationPath, { mode: (entry.stats.mode & 0o7777) | 0o700 })
      if (!entry.relativePath) ownsPreparedPath = true
    }

    for (const entry of source.entries.filter((item) => !item.isDirectory)) {
      signal.throwIfAborted()
      const destinationPath = join(preparedPath, entry.relativePath)
      const inputHandle = await open(entry.absolutePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | constants.O_NONBLOCK)
      try {
        const currentStats = await inputHandle.stat()
        if (!currentStats.isFile()) throw new ApiException('unsupported', 'The requested path is unsupported.', HttpStatus.BAD_REQUEST)
        if (currentStats.size !== entry.stats.size) invalidateTotal()

        const input = inputHandle.createReadStream({ autoClose: true })
        const outputHandle = await open(destinationPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, entry.stats.mode & 0o7777)
        if (!source.source.isDirectory) ownsPreparedPath = true
        const output = outputHandle.createWriteStream({ autoClose: true })
        const sample = () => reportBytes(bytesWritten + output.bytesWritten)
        const samplingTimer = setInterval(sample, 100)
        try {
          await pipeline(input, output, { signal })
        } finally {
          clearInterval(samplingTimer)
          bytesWritten += output.bytesWritten
          reportBytes(bytesWritten)
        }

        const finalStats = await lstat(entry.absolutePath)
        if (finalStats.isSymbolicLink() || !finalStats.isFile() || finalStats.size !== entry.stats.size || output.bytesWritten !== entry.stats.size) {
          invalidateTotal()
        }
        await chmod(destinationPath, entry.stats.mode & 0o7777)
      } catch (error) {
        await inputHandle.close().catch(() => undefined)
        throw error
      }
    }

    signal.throwIfAborted()
    const currentEntries = await listSupportedTree(source.source, signal)
    const matchesPreparedSize = hasSamePreparedSource(source.entries, currentEntries, true)
    if (!matchesPreparedSize) invalidateTotal()
    enterFinalizing()
    for (const entry of directories.toReversed()) {
      const destinationPath = join(preparedPath, entry.relativePath)
      await chmod(destinationPath, entry.stats.mode & 0o7777)
    }
    signal.throwIfAborted()
    const cleanupFailure = await promotePreparedReplacement(preparedPath, target, operationId, index)
    return { bytesWritten, cleanupFailure, matchesPreparedSize }
  } catch (error) {
    if (ownsPreparedPath) {
      for (const entry of directories) {
        const destinationPath = join(preparedPath, entry.relativePath)
        await chmod(destinationPath, (entry.stats.mode & 0o7777) | 0o700).catch(() => undefined)
      }
      await rm(preparedPath, { recursive: true, force: true }).catch(() => undefined)
    }
    throw toFilesystemException(error)
  }
}

function hasSamePreparedSource(expected: SupportedTreeEntry[], observed: SupportedTreeEntry[], compareMetadata: boolean): boolean {
  return (
    expected.length === observed.length &&
    expected.every((entry, index) => {
      const current = observed[index]
      return (
        entry.relativePath === current.relativePath &&
        entry.isDirectory === current.isDirectory &&
        entry.stats.size === current.stats.size &&
        (!compareMetadata ||
          (entry.stats.dev === current.stats.dev &&
            entry.stats.ino === current.stats.ino &&
            entry.stats.mtimeMs === current.stats.mtimeMs &&
            entry.stats.ctimeMs === current.stats.ctimeMs))
      )
    })
  )
}

function getContentSize(entries: SupportedTreeEntry[]): { bytes: number; bytesTotal: number | null } {
  let bytes = 0
  let isTotalKnown = true
  for (const entry of entries) {
    if (entry.isDirectory) continue
    const size = entry.stats.size
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
    const entries = await listSupportedTree({ ...source.source, absolutePath: targetPath })
    const size = getContentSize(entries)
    const matchesPreparedSize = hasSamePreparedSource(source.entries, entries, compareMetadata)
    return { ...size, matchesPreparedSize }
  } catch {
    return { bytes: source.bytes, bytesTotal: null, matchesPreparedSize: false }
  }
}
