import { randomUUID } from 'node:crypto'
import { createWriteStream, type WriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { Failure } from '../../shared/failures.js'
import type { CapacityPort } from '../Application/ports.js'
import type { StoredUploadPart } from '../Application/ports.js'
import { isMissing, toFilesystemFailure, withFilesystemFailure } from './filesystem-failures.js'
import { StreamingCapacityGuard } from './streaming-capacity-guard.js'

export class UploadPartStorage {
  private readonly capacities = new Map<string, { bytesTotal: number; guard: StreamingCapacityGuard }>()

  constructor(private readonly capacity: CapacityPort) {}

  async store(
    stagingPath: string,
    bytesTotal: number,
    signal: AbortSignal,
    file: { fieldname: string; stream: Readable },
    report: (bytes: number) => void
  ): Promise<StoredUploadPart> {
    const capacity = this.getCapacity(stagingPath, bytesTotal)
    const filename = randomUUID()
    const path = join(stagingPath, filename)
    let output: WriteStream | undefined
    let transform: ReturnType<StreamingCapacityGuard['createTransform']> | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    try {
      await capacity.checkBeforeOutput(() => BigInt(bytesTotal) - capacity.streamedBytes)
      output = createWriteStream(path, { flags: 'wx' })
      transform = capacity.createTransform(
        () => BigInt(bytesTotal) - capacity.streamedBytes,
        () => output!.bytesWritten
      )
      timer = setInterval(() => report(output?.bytesWritten ?? 0), 100)
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
