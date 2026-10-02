import { constants } from 'node:fs'
import { chmod, lstat, mkdir, open, rm } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Failure } from '../../shared/failures.js'
import type { CopyMoveTreeEntry } from '../Application/copy-move-models.js'
import { isMissing, toFilesystemFailure, withFilesystemFailure } from './filesystem-failures.js'
import type { StreamingCapacityGuard } from './streaming-capacity-guard.js'

const PERMISSION_MASK = 0o7777
const OWNER_ACCESS = 0o700
const PROGRESS_INTERVAL_MS = 100

export interface PreparedCopyOutput {
  preparedPath: string
  sourceBytes: bigint
  bytesWritten: number
  itemBytesAccepted: bigint
  ownsPreparedPath: boolean
  signal: AbortSignal
  capacity: StreamingCapacityGuard
  reportBytes: (bytes: number) => void
  invalidateTotal: () => void
}

export async function createPreparedDirectories(directories: CopyMoveTreeEntry[], output: PreparedCopyOutput): Promise<void> {
  for (const entry of directories) {
    output.signal.throwIfAborted()
    const destinationPath = join(output.preparedPath, entry.relativePath)
    const currentStats = await lstat(entry.absolutePath)
    if (!currentStats.isDirectory()) throw new Failure('unsupported', 'The requested path is unsupported.')
    await mkdir(destinationPath, { mode: (entry.mode & PERMISSION_MASK) | OWNER_ACCESS })
    if (!entry.relativePath) output.ownsPreparedPath = true
  }
}

export async function copyPreparedFiles(entries: CopyMoveTreeEntry[], isDirectory: boolean, output: PreparedCopyOutput): Promise<void> {
  for (const entry of entries.filter((item) => !item.isDirectory)) {
    output.signal.throwIfAborted()
    const destinationPath = join(output.preparedPath, entry.relativePath)
    const inputHandle = await open(entry.absolutePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | constants.O_NONBLOCK)
    try {
      const currentStats = await inputHandle.stat()
      if (!currentStats.isFile()) throw new Failure('unsupported', 'The requested path is unsupported.')
      if (currentStats.size !== entry.size) output.invalidateTotal()
      const writtenBytes = await streamPreparedFile(inputHandle, destinationPath, entry.mode, isDirectory, output)
      const finalStats = await lstat(entry.absolutePath)
      if (!finalStats.isFile() || finalStats.size !== entry.size || writtenBytes !== entry.size) output.invalidateTotal()
      await chmod(destinationPath, entry.mode & PERMISSION_MASK)
    } catch (error) {
      await inputHandle.close().catch(() => undefined)
      throw error
    }
  }
}

async function streamPreparedFile(
  inputHandle: FileHandle,
  destinationPath: string,
  mode: number,
  isDirectory: boolean,
  output: PreparedCopyOutput
): Promise<number> {
  const input = inputHandle.createReadStream({ autoClose: true })
  const remainingBytes = () => {
    const remaining = output.sourceBytes - output.itemBytesAccepted
    return remaining > 0n ? remaining : 0n
  }
  await output.capacity.checkBeforeOutput(remainingBytes())
  const outputHandle = await open(destinationPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode & PERMISSION_MASK)
  if (!isDirectory) output.ownsPreparedPath = true
  const stream = outputHandle.createWriteStream({ autoClose: true })
  const capacityTransform = output.capacity.createTransform(
    remainingBytes,
    () => stream.bytesWritten,
    (byteCount) => {
      output.itemBytesAccepted += BigInt(byteCount)
    }
  )
  const samplingTimer = setInterval(() => output.reportBytes(output.bytesWritten + stream.bytesWritten), PROGRESS_INTERVAL_MS)
  try {
    await pipeline(input, capacityTransform.transform, stream, { signal: output.signal })
  } finally {
    clearInterval(samplingTimer)
    capacityTransform.dispose()
    output.bytesWritten += stream.bytesWritten
    output.reportBytes(output.bytesWritten)
  }
  return stream.bytesWritten
}

export async function restoreDirectoryModes(directories: CopyMoveTreeEntry[], preparedPath: string): Promise<void> {
  for (const entry of directories) await chmod(join(preparedPath, entry.relativePath), entry.mode & PERMISSION_MASK)
}

export async function cleanupPreparedCopy(directories: CopyMoveTreeEntry[], output: PreparedCopyOutput, error: unknown): Promise<Failure> {
  let failure = error instanceof Error && error.name === 'AbortError' && output.signal.aborted ? output.signal.reason : error
  if (output.ownsPreparedPath) {
    for (const entry of directories) {
      const destinationPath = join(output.preparedPath, entry.relativePath)
      await chmod(destinationPath, (entry.mode & PERMISSION_MASK) | OWNER_ACCESS).catch(() => undefined)
    }
    try {
      await rm(output.preparedPath, { recursive: true, force: true })
    } catch (cleanupError) {
      if (!isMissing(cleanupError)) failure = withFilesystemFailure(failure, 'Temporary copy data could not be removed.', cleanupError)
    }
  }
  return toFilesystemFailure(failure)
}
