import { HttpStatus, Injectable } from '@nestjs/common'
import type { ConflictPolicy, CopyConflict } from '@raft/shared'
import { rename, rm } from 'node:fs/promises'
import { basename } from 'node:path'
import { ApiException } from '../api/api-exception.js'
import { TransferService } from '../transfers/transfer.service.js'
import { FilesystemService } from './filesystem.service.js'
import { getCopyMoveConflicts, validateCopyMoveSelection, validateCopyMoveTargets } from './copy-move-validation.js'
import { resolveReplacementTargets } from './prepared-replacement.js'
import type { PreparedDestination } from './prepared-replacement.js'
import { toFilesystemException, withFilesystemFailure } from './errors.js'
import { copyPreparedItem, measureMovedSource, prepareCopySources } from './copy-prepared-item.js'
import type { PreparedCopySource } from './copy-prepared-item.js'
import { StorageCapacityService } from './storage-capacity.service.js'
import { StreamingCapacityGuard } from './streaming-capacity-guard.js'

@Injectable()
export class MoveFilesystemService {
  constructor(
    private readonly filesystemService: FilesystemService,
    private readonly transferService: TransferService,
    private readonly storageCapacityService: StorageCapacityService
  ) {}

  async preflight(sourcePaths: string[], destinationPath: string): Promise<CopyConflict[]> {
    const { sources, destination, candidates } = await validateCopyMoveSelection(this.filesystemService, sourcePaths, destinationPath, 'move')
    return getCopyMoveConflicts(sources, destination, candidates)
  }

  move(operationId: string, sourcePaths: string[], destinationPath: string, policy: ConflictPolicy, signal: AbortSignal): Promise<void> {
    return this.filesystemService.runTransferMutation(operationId, async () => {
      signal.throwIfAborted()
      const { sources, destination, candidates } = await validateCopyMoveSelection(this.filesystemService, sourcePaths, destinationPath, 'move', true)
      if (policy === 'overwrite') validateCopyMoveTargets(sources, destination, candidates, 'move')
      const targets = await resolveReplacementTargets(destination.absolutePath, candidates, policy)
      validateCopyMoveTargets(sources, destination, targets, 'move')
      const prepared = await prepareCopySources(sources, (currentName) => this.transferService.progress(operationId, { currentName }), signal)
      this.transferService.progress(operationId, { phase: 'transferring', bytesTotal: prepared.bytesTotal })
      const capacity = new StreamingCapacityGuard((requiredBytes) => this.storageCapacityService.assertAvailable(destination.absolutePath, requiredBytes))

      let completedItems = 0
      let bytesProcessed = 0
      let bytesTotal = prepared.bytesTotal
      try {
        for (const [index, source] of prepared.sources.entries()) {
          signal.throwIfAborted()
          this.transferService.progress(operationId, { phase: 'transferring', currentName: basename(source.source.virtualPath) })
          const target = targets[index]
          const copyAndDeleteSource = async () => {
            bytesProcessed += await this.copyThenDeleteSource(
              source,
              target,
              operationId,
              index,
              signal,
              capacity,
              (itemBytes) => this.transferService.progress(operationId, { bytesProcessed: bytesProcessed + itemBytes }),
              () => {
                bytesTotal = null
                this.transferService.progress(operationId, { bytesTotal: null })
              }
            )
          }
          if (policy === 'overwrite' && target.existing) {
            await copyAndDeleteSource()
          } else {
            try {
              this.transferService.progress(operationId, { phase: 'finalizing' })
              await rename(source.source.absolutePath, target.path)
              const movedSize = await measureMovedSource(source, target.path)
              if (!movedSize.matchesPreparedSize || movedSize.bytesTotal === null) {
                bytesTotal = null
                this.transferService.progress(operationId, { bytesTotal: null })
              }
              bytesProcessed += movedSize.bytes
              this.transferService.progress(operationId, { bytesProcessed, bytesTotal })
            } catch (error) {
              if (!isCrossDeviceError(error)) throw toFilesystemException(error)
              this.transferService.progress(operationId, { phase: 'transferring' })
              await copyAndDeleteSource()
            }
          }
          completedItems += 1
          this.transferService.progress(operationId, {
            current: completedItems,
            currentName: basename(source.source.virtualPath),
            bytesProcessed,
            bytesTotal
          })
        }
        signal.throwIfAborted()
      } catch (error) {
        if (completedItems > 0) {
          throw withFilesystemFailure(error, `The move stopped after ${completedItems} of ${sources.length} items.`)
        }
        throw error
      }
    })
  }

  private async copyThenDeleteSource(
    source: PreparedCopySource,
    target: PreparedDestination,
    operationId: string,
    index: number,
    signal: AbortSignal,
    capacity: StreamingCapacityGuard,
    reportBytes: (bytesWritten: number) => void,
    invalidateTotal: () => void
  ): Promise<number> {
    const result = await copyPreparedItem(source, target, operationId, index, signal, capacity, reportBytes, invalidateTotal, () =>
      this.transferService.progress(operationId, { phase: 'finalizing' })
    )
    if (result.cleanupFailure) throw result.cleanupFailure
    if (!result.matchesPreparedSize || !(await measureMovedSource(source, source.source.absolutePath, true)).matchesPreparedSize) {
      invalidateTotal()
      throw new ApiException('operation_failed', 'Source content changed during the move. The original items were kept.', HttpStatus.CONFLICT)
    }
    try {
      await rm(source.source.absolutePath, { recursive: true })
    } catch (error) {
      throw withFilesystemFailure(error, 'The destination was copied, but source content could not be fully removed.')
    }
    return result.bytesWritten
  }
}

function isCrossDeviceError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EXDEV'
}
