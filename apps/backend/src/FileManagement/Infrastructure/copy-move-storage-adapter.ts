import { rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Failure } from '../../shared/failures.js'
import type { CopyMoveItem, CopyMoveResult } from '../Application/copy-move-models.js'
import type { ResolvedPath } from '../Domain/models.js'
import { copyPreparedItem, measureMovedSource, prepareCopySources } from './copy-prepared-item.js'
import type { PreparedCopySource } from './copy-prepared-item.js'
import { StreamingCapacityGuard } from './streaming-capacity-guard.js'
import type { CapacityPort } from '../Application/ports.js'
import { toFilesystemFailure, withFilesystemFailure } from './filesystem-failures.js'

export class CopyMoveStorageAdapter {
  constructor(private readonly capacity: CapacityPort) {}

  prepareSources(sources: ResolvedPath[], signal: AbortSignal, onPreparing: (name: string) => void) {
    return prepareCopySources(sources, onPreparing, signal)
  }

  copyItem(
    item: CopyMoveItem,
    operationId: string,
    index: number,
    signal: AbortSignal,
    reportBytes: (bytes: number) => void,
    invalidateTotal: () => void,
    _enterTransferring: () => void,
    enterFinalizing: () => void
  ): Promise<CopyMoveResult> {
    const source = sourceOf(item)
    return copyPreparedItem(
      source,
      item.target,
      operationId,
      index,
      signal,
      this.capacityGuard(item.target.path),
      reportBytes,
      invalidateTotal,
      enterFinalizing
    ).then((result) => ({
      bytesWritten: result.bytesWritten,
      bytesTotal: result.matchesPreparedSize ? item.bytes : null,
      ...(result.cleanupFailure === undefined ? {} : { cleanupFailure: result.cleanupFailure }),
      matchesPreparedSize: result.matchesPreparedSize
    }))
  }

  async moveItem(
    item: CopyMoveItem,
    operationId: string,
    index: number,
    signal: AbortSignal,
    reportBytes: (bytes: number) => void,
    invalidateTotal: () => void,
    enterTransferring: () => void,
    enterFinalizing: () => void
  ): Promise<CopyMoveResult> {
    const source = sourceOf(item)
    const copyThenDelete = async (): Promise<CopyMoveResult> => {
      const result = await copyPreparedItem(
        source,
        item.target,
        operationId,
        index,
        signal,
        this.capacityGuard(item.target.path),
        reportBytes,
        invalidateTotal,
        enterFinalizing
      )
      if (result.cleanupFailure) throw result.cleanupFailure
      if (!result.matchesPreparedSize || !(await measureMovedSource(source, source.source.absolutePath, true)).matchesPreparedSize) {
        invalidateTotal()
        throw new Failure('source_changed', 'Source content changed during the move. The original items were kept.')
      }
      try {
        await rm(source.source.absolutePath, { recursive: true })
      } catch (error) {
        throw withFilesystemFailure(error, 'The destination was copied, but source content could not be fully removed.')
      }
      return { bytesWritten: result.bytesWritten, bytesTotal: item.bytes, matchesPreparedSize: true }
    }

    if (item.target.existing) return copyThenDelete()
    try {
      enterFinalizing()
      await rename(source.source.absolutePath, item.target.path)
      const moved = await measureMovedSource(source, item.target.path)
      if (!moved.matchesPreparedSize || moved.bytesTotal === null) invalidateTotal()
      return { bytesWritten: moved.bytes, bytesTotal: moved.bytesTotal, matchesPreparedSize: moved.matchesPreparedSize }
    } catch (error) {
      if (!isCrossDeviceError(error)) throw toFilesystemFailure(error)
      enterTransferring()
      return copyThenDelete()
    }
  }

  private capacityGuard(targetPath: string): StreamingCapacityGuard {
    return new StreamingCapacityGuard((requiredBytes) => this.capacity.assertAvailable(dirname(targetPath), requiredBytes))
  }
}

function sourceOf(item: CopyMoveItem): PreparedCopySource {
  return { source: item.source, entries: item.entries, bytes: item.bytes }
}

function isCrossDeviceError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EXDEV'
}
