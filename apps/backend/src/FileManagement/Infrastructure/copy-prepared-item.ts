import { constants } from 'node:fs'
import { chmod, lstat, mkdir, open, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Failure } from '../../shared/failures.js'
import { toFilesystemFailure, withFilesystemFailure, isMissing } from './filesystem-failures.js'
import { StreamingCapacityGuard } from './streaming-capacity-guard.js'
import { PathResolver } from './path-resolver.js'
import type { SupportedTreeEntry } from './path-resolver.js'
import type { ResolvedPath } from '../Domain/models.js'
import type { CopyMoveTreeEntry } from '../Application/copy-move-models.js'
import { promotePreparedReplacement, unusedInternalPath } from './prepared-replacement.js'
import type { PreparedDestination } from './prepared-replacement.js'

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
  const preparedPath = await unusedInternalPath(dirname(target.path), 'tmp', operationId, index + 1)
  const directories = source.entries.filter((entry) => entry.isDirectory)
  let bytesWritten = 0
  let itemBytesAccepted = 0n
  let ownsPreparedPath = false

  try {
    for (const entry of directories) {
      signal.throwIfAborted()
      const destinationPath = join(preparedPath, entry.relativePath)
      const currentStats = await lstat(entry.absolutePath)
      if (currentStats.isSymbolicLink() || !currentStats.isDirectory()) {
        throw new Failure('unsupported', 'The requested path is unsupported.')
      }
      await mkdir(destinationPath, { mode: (entry.mode & 0o7777) | 0o700 })
      if (!entry.relativePath) ownsPreparedPath = true
    }

    for (const entry of source.entries.filter((item) => !item.isDirectory)) {
      signal.throwIfAborted()
      const destinationPath = join(preparedPath, entry.relativePath)
      const inputHandle = await open(entry.absolutePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | constants.O_NONBLOCK)
      try {
        const currentStats = await inputHandle.stat()
        if (!currentStats.isFile()) throw new Failure('unsupported', 'The requested path is unsupported.')
        if (currentStats.size !== entry.size) invalidateTotal()

        const input = inputHandle.createReadStream({ autoClose: true })
        const remainingBytes = () => {
          const remaining = sourceBytes - itemBytesAccepted
          return remaining > 0n ? remaining : 0n
        }
        await capacity.checkBeforeOutput(remainingBytes())
        const outputHandle = await open(destinationPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, entry.mode & 0o7777)
        if (!source.source.isDirectory) ownsPreparedPath = true
        const output = outputHandle.createWriteStream({ autoClose: true })
        const capacityTransform = capacity.createTransform(
          remainingBytes,
          () => output.bytesWritten,
          (byteCount) => {
            itemBytesAccepted += BigInt(byteCount)
          }
        )
        const sample = () => reportBytes(bytesWritten + output.bytesWritten)
        const samplingTimer = setInterval(sample, 100)
        try {
          await pipeline(input, capacityTransform.transform, output, { signal })
        } finally {
          clearInterval(samplingTimer)
          capacityTransform.dispose()
          bytesWritten += output.bytesWritten
          reportBytes(bytesWritten)
        }

        const finalStats = await lstat(entry.absolutePath)
        if (finalStats.isSymbolicLink() || !finalStats.isFile() || finalStats.size !== entry.size || output.bytesWritten !== entry.size) {
          invalidateTotal()
        }
        await chmod(destinationPath, entry.mode & 0o7777)
      } catch (error) {
        await inputHandle.close().catch(() => undefined)
        throw error
      }
    }

    signal.throwIfAborted()
    const currentEntries = (await paths.listSupportedTree(source.source, signal)).map(toCopyEntry)
    const matchesPreparedSize = hasSamePreparedSource(source.entries, currentEntries, true)
    if (!matchesPreparedSize) invalidateTotal()
    enterFinalizing()
    for (const entry of directories.toReversed()) {
      const destinationPath = join(preparedPath, entry.relativePath)
      await chmod(destinationPath, entry.mode & 0o7777)
    }
    signal.throwIfAborted()
    const cleanupFailure = await promotePreparedReplacement(preparedPath, target, operationId, index)
    return { bytesWritten, cleanupFailure, matchesPreparedSize }
  } catch (error) {
    let failure = error instanceof Error && error.name === 'AbortError' && signal.aborted ? signal.reason : error
    if (ownsPreparedPath) {
      for (const entry of directories) {
        const destinationPath = join(preparedPath, entry.relativePath)
        await chmod(destinationPath, (entry.mode & 0o7777) | 0o700).catch(() => undefined)
      }
      try {
        await rm(preparedPath, { recursive: true, force: true })
      } catch (cleanupError) {
        if (!isMissing(cleanupError)) failure = withFilesystemFailure(failure, 'Temporary copy data could not be removed.', cleanupError)
      }
    }
    throw toFilesystemFailure(failure)
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
