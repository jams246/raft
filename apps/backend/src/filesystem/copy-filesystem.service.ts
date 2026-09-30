import { Injectable } from '@nestjs/common'
import type { ConflictPolicy, CopyConflict } from '@raft/shared'
import { basename } from 'node:path'
import { TransferService } from '../transfers/transfer.service.js'
import { FilesystemService } from './filesystem.service.js'
import { withFilesystemFailure } from './errors.js'
import { getCopyMoveConflicts, validateCopyMoveSelection, validateCopyMoveTargets } from './copy-move-validation.js'
import { resolveReplacementTargets } from './prepared-replacement.js'
import { copyPreparedItem, prepareCopySources } from './copy-prepared-item.js'
import { StorageCapacityService } from './storage-capacity.service.js'
import { StreamingCapacityGuard } from './streaming-capacity-guard.js'

@Injectable()
export class CopyFilesystemService {
  constructor(
    private readonly filesystemService: FilesystemService,
    private readonly transferService: TransferService,
    private readonly storageCapacityService: StorageCapacityService
  ) {}

  async preflight(sourcePaths: string[], destinationPath: string): Promise<CopyConflict[]> {
    const { sources, destination, candidates } = await validateCopyMoveSelection(this.filesystemService, sourcePaths, destinationPath, 'copy')
    return getCopyMoveConflicts(sources, destination, candidates)
  }

  copy(operationId: string, sourcePaths: string[], destinationPath: string, policy: ConflictPolicy, signal: AbortSignal): Promise<void> {
    return this.filesystemService.runTransferMutation(operationId, async () => {
      signal.throwIfAborted()
      const { sources, destination, candidates } = await validateCopyMoveSelection(this.filesystemService, sourcePaths, destinationPath, 'copy', true)
      const targets = await resolveReplacementTargets(destination.absolutePath, candidates, policy)
      validateCopyMoveTargets(sources, destination, targets, 'copy')
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
          const result = await copyPreparedItem(
            source,
            targets[index],
            operationId,
            index,
            signal,
            capacity,
            (itemBytes) => this.transferService.progress(operationId, { bytesProcessed: bytesProcessed + itemBytes }),
            () => {
              bytesTotal = null
              this.transferService.progress(operationId, { bytesTotal: null })
            },
            () => this.transferService.progress(operationId, { phase: 'finalizing' })
          )
          bytesProcessed += result.bytesWritten
          completedItems += 1
          this.transferService.progress(operationId, {
            current: completedItems,
            currentName: basename(source.source.virtualPath),
            bytesProcessed,
            bytesTotal
          })
          if (result.cleanupFailure) throw result.cleanupFailure
        }
        signal.throwIfAborted()
      } catch (error) {
        if (completedItems > 0) {
          throw withFilesystemFailure(error, `The copy stopped after ${completedItems} of ${sources.length} items.`)
        }
        throw error
      }
    })
  }
}
