import { randomUUID } from 'node:crypto'
import { type WriteStream, createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ConcurrencyLimit } from '../../shared/concurrency-limit.js'
import { Failure } from '../../shared/failures.js'
import type { CapacityPort } from '../Application/ports.js'
import type { StoredUploadPart } from '../Application/ports.js'
import { isMissing, toFilesystemFailure, withFilesystemFailure } from './filesystem-failures.js'
import { StreamingCapacityGuard } from './streaming-capacity-guard.js'

const PROGRESS_INTERVAL_MS = 100
// Multipart parsing hands over every part as it arrives without waiting for earlier writes, so a folder of many small files
// would otherwise open thousands of files at once. Queued parts hold no descriptor or timer until a slot frees up.
const MAX_CONCURRENT_PART_WRITES = 16

export class UploadPartStorage {
  private readonly capacities = new Map<string, { bytesTotal: number; guard: StreamingCapacityGuard }>()
  private readonly writes = new ConcurrencyLimit(MAX_CONCURRENT_PART_WRITES)

  constructor(private readonly capacity: CapacityPort) {}

  store(
    stagingPath: string,
    bytesTotal: number,
    signal: AbortSignal,
    file: { fieldname: string; stream: Readable },
    report: (bytes: number) => void
  ): Promise<StoredUploadPart> {
    return this.writes.run(() => this.write(stagingPath, bytesTotal, signal, file, report), signal)
  }

  private async write(
    stagingPath: string,
    bytesTotal: number,
    signal: AbortSignal,
    file: { fieldname: string; stream: Readable },
    report: (bytes: number) => void
  ): Promise<StoredUploadPart> {
    const capacity = this.getCapacity(stagingPath, bytesTotal)
    const path = join(stagingPath, randomUUID())
    let output: WriteStream | undefined
    let transform: ReturnType<StreamingCapacityGuard['createTransform']> | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    try {
      await capacity.checkBeforeOutput(() => BigInt(bytesTotal) - capacity.streamedBytes)
      output = createWriteStream(path, { flags: 'wx' })
      transform = capacity.createTransform(
        () => BigInt(bytesTotal) - capacity.streamedBytes,
        () => output?.bytesWritten ?? 0
      )
      timer = setInterval(() => report(output?.bytesWritten ?? 0), PROGRESS_INTERVAL_MS)
      await pipeline(file.stream, transform.transform, output, { signal })
      return { fieldname: file.fieldname, path, size: output.bytesWritten }
    } catch (error) {
      const primaryFailure = error instanceof Failure ? error : (signal.reason ?? error)
      try {
        await unlink(path)
      } catch (cleanupError) {
        if (!isMissing(cleanupError)) throw withFilesystemFailure(primaryFailure, 'Temporary upload data could not be removed.', cleanupError)
      }
      throw toFilesystemFailure(primaryFailure)
    } finally {
      if (timer) clearInterval(timer)
      transform?.dispose()
      report(output?.bytesWritten ?? 0)
    }
  }

  async remove(stagingPath: string, path: string): Promise<void> {
    if (dirname(path) !== stagingPath) throw new Failure('invalid_request', 'The upload request is invalid.')
    try {
      await unlink(path)
    } catch (error) {
      if (!isMissing(error)) throw toFilesystemFailure(error)
    }
  }

  clear(stagingPath: string): void {
    this.capacities.delete(stagingPath)
  }

  private getCapacity(stagingPath: string, bytesTotal: number): StreamingCapacityGuard {
    let state = this.capacities.get(stagingPath)
    if (!state) {
      state = {
        bytesTotal,
        guard: new StreamingCapacityGuard((requiredBytes) => this.capacity.assertAvailable(dirname(stagingPath), requiredBytes), BigInt(bytesTotal))
      }
      this.capacities.set(stagingPath, state)
    }
    if (state.bytesTotal !== bytesTotal) throw new Failure('invalid_request', 'The upload request is invalid.')
    return state.guard
  }
}
