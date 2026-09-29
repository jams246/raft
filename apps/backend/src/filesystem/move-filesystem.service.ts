import { HttpStatus, Injectable } from '@nestjs/common'
import type { ConflictPolicy, CopyConflict } from '@raft/shared'
import { rename, rm } from 'node:fs/promises'
import { basename } from 'node:path'
import { ApiException } from '../api/api-exception.js'
import { TransferService } from '../transfers/transfer.service.js'
import { copyPreparedItem } from './copy-filesystem.service.js'
import { FilesystemService } from './filesystem.service.js'
import { getCopyMoveConflicts, validateCopyMoveSelection, validateCopyMoveTargets } from './copy-move-validation.js'
import { resolveReplacementTargets } from './prepared-replacement.js'
import type { PreparedDestination } from './prepared-replacement.js'
import type { ValidatedPath } from './paths.js'
import { toFilesystemException } from './errors.js'

@Injectable()
export class MoveFilesystemService {
  constructor(
    private readonly filesystemService: FilesystemService,
    private readonly transferService: TransferService
  ) {}

  async preflight(sourcePaths: string[], destinationPath: string): Promise<CopyConflict[]> {
    const { sources, destination, candidates } = await validateCopyMoveSelection(this.filesystemService, sourcePaths, destinationPath, 'move')
    return getCopyMoveConflicts(sources, destination, candidates)
  }

  move(operationId: string, sourcePaths: string[], destinationPath: string, policy: ConflictPolicy, signal: AbortSignal): Promise<void> {
    return this.filesystemService.runTransferMutation(operationId, async () => {
      signal.throwIfAborted()
      const { sources, destination, candidates } = await validateCopyMoveSelection(this.filesystemService, sourcePaths, destinationPath, 'move')
      if (policy === 'overwrite') validateCopyMoveTargets(sources, destination, candidates, 'move')
      const targets = await resolveReplacementTargets(destination.absolutePath, candidates, policy)
      validateCopyMoveTargets(sources, destination, targets, 'move')

      let completedItems = 0
      try {
        for (const [index, source] of sources.entries()) {
          signal.throwIfAborted()
          this.transferService.progress(operationId, completedItems, basename(source.virtualPath))
          const target = targets[index]
          if (policy === 'overwrite' && target.existing) {
            await this.copyThenDeleteSource(source, target, operationId, index, signal)
          } else {
            try {
              await rename(source.absolutePath, target.path)
            } catch (error) {
              if (!isCrossDeviceError(error)) throw toFilesystemException(error)
              await this.copyThenDeleteSource(source, target, operationId, index, signal)
            }
          }
          completedItems += 1
          this.transferService.progress(operationId, completedItems, basename(source.virtualPath))
        }
        signal.throwIfAborted()
      } catch (error) {
        if (completedItems > 0) {
          const cause = error instanceof ApiException ? error.message : 'The operation failed.'
          throw new ApiException(
            'operation_failed',
            `The move stopped after ${completedItems} of ${sources.length} items. ${cause}`,
            HttpStatus.INTERNAL_SERVER_ERROR
          )
        }
        throw error
      }
    })
  }

  private async copyThenDeleteSource(
    source: ValidatedPath,
    target: PreparedDestination,
    operationId: string,
    index: number,
    signal: AbortSignal
  ): Promise<void> {
    const cleanupFailure = await copyPreparedItem(source, target, operationId, index, signal)
    if (cleanupFailure) throw cleanupFailure
    try {
      await rm(source.absolutePath, { recursive: true })
    } catch {
      throw new ApiException('operation_failed', 'The destination was copied, but source content could not be fully removed.', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }
}

function isCrossDeviceError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EXDEV'
}
