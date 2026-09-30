import { Transform } from 'node:stream'
import { HttpStatus } from '@nestjs/common'
import { ApiException } from '../api/api-exception.js'

const CAPACITY_RECHECK_BYTES = 8n * 1024n * 1024n
const MAX_TRANSFORM_CHUNK_BYTES = Number(CAPACITY_RECHECK_BYTES)

export class StreamingCapacityGuard {
  private acceptedBytes = 0n
  private snapshotBytes = 0n
  private readonly pendingBytesByStream = new Map<object, bigint>()
  private readonly streams = new Map<object, { readWrittenBytes: () => number; writtenBytes: number }>()
  private queue = Promise.resolve()

  constructor(
    private readonly checkCapacity: (requiredBytes: bigint) => Promise<void>,
    private readonly maxBytes?: bigint
  ) {}

  get streamedBytes(): bigint {
    return this.acceptedBytes
  }

  checkBeforeOutput(remainingBytes: bigint | (() => bigint)): Promise<void> {
    return this.serialize(async () => {
      this.syncWritten()
      const remaining = typeof remainingBytes === 'function' ? remainingBytes() : remainingBytes
      await this.checkCapacity(remaining + this.pendingBytes())
      this.snapshotBytes = this.acceptedBytes
    })
  }

  createTransform(
    remainingBytes: () => bigint,
    readWrittenBytes: () => number,
    onAccepted?: (byteCount: number) => void
  ): {
    transform: Transform
    dispose: () => void
  } {
    const acceptChunk = this.acceptChunk.bind(this)
    const streamKey = {}
    this.streams.set(streamKey, { readWrittenBytes, writtenBytes: 0 })
    return {
      transform: new Transform({
        transform(chunk: Buffer | string, encoding, callback) {
          const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
          void (async () => {
            for (let offset = 0; offset < data.byteLength; offset += MAX_TRANSFORM_CHUNK_BYTES) {
              const segment = data.subarray(offset, Math.min(offset + MAX_TRANSFORM_CHUNK_BYTES, data.byteLength))
              await acceptChunk(streamKey, segment.byteLength, remainingBytes)
              onAccepted?.(segment.byteLength)
              this.push(segment)
            }
          })()
            .then(() => callback())
            .catch((error: unknown) => callback(asError(error)))
        }
      }),
      dispose: () => {
        this.syncStream(streamKey)
        this.streams.delete(streamKey)
      }
    }
  }

  private acceptChunk(streamKey: object, byteCount: number, remainingBytes: () => bigint): Promise<void> {
    return this.serialize(async () => {
      const chunkBytes = BigInt(byteCount)
      const nextAcceptedBytes = this.acceptedBytes + chunkBytes
      if (this.maxBytes !== undefined && nextAcceptedBytes > this.maxBytes) {
        throw new ApiException('invalid_request', 'The uploaded data exceeds its declared byte total.', HttpStatus.BAD_REQUEST)
      }
      if (nextAcceptedBytes - this.snapshotBytes >= CAPACITY_RECHECK_BYTES) {
        this.syncWritten()
        const currentBytes = remainingBytes()
        await this.checkCapacity((currentBytes > chunkBytes ? currentBytes : chunkBytes) + this.pendingBytes())
        this.snapshotBytes = this.acceptedBytes
      }
      this.acceptedBytes = nextAcceptedBytes
      this.pendingBytesByStream.set(streamKey, (this.pendingBytesByStream.get(streamKey) ?? 0n) + chunkBytes)
    })
  }

  private syncWritten(): void {
    for (const streamKey of this.streams.keys()) this.syncStream(streamKey)
  }

  private syncStream(streamKey: object): void {
    const stream = this.streams.get(streamKey)
    if (!stream) return
    const writtenBytes = stream.readWrittenBytes()
    const newWrittenBytes = writtenBytes - stream.writtenBytes
    if (newWrittenBytes <= 0) return
    stream.writtenBytes = writtenBytes
    const remaining = (this.pendingBytesByStream.get(streamKey) ?? 0n) - BigInt(newWrittenBytes)
    if (remaining > 0n) this.pendingBytesByStream.set(streamKey, remaining)
    else this.pendingBytesByStream.delete(streamKey)
  }

  private pendingBytes(): bigint {
    return [...this.pendingBytesByStream.values()].reduce((total, pending) => total + pending, 0n)
  }

  private serialize(action: () => Promise<void>): Promise<void> {
    const result = this.queue.then(action)
    this.queue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error('The transfer failed.')
}
