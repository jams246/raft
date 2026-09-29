import { HttpStatus, Injectable } from '@nestjs/common'
import type { ConflictPolicy, CopyConflict } from '@raft/shared'
import { cp, rm } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { ApiException } from '../api/api-exception.js'
import { TransferService } from '../transfers/transfer.service.js'
import { FilesystemService } from './filesystem.service.js'
import { getCopyMoveConflicts, validateCopyMoveSelection, validateCopyMoveTargets } from './copy-move-validation.js'
import { promotePreparedReplacement, resolveReplacementTargets, unusedInternalPath } from './prepared-replacement.js'
import type { PreparedDestination } from './prepared-replacement.js'
import type { ValidatedPath } from './paths.js'

@Injectable()
export class CopyFilesystemService {
  constructor(
    private readonly filesystemService: FilesystemService,
    private readonly transferService: TransferService
  ) {}

  async preflight(sourcePaths: string[], destinationPath: string): Promise<CopyConflict[]> {
    const { sources, destination, candidates } = await validateCopyMoveSelection(this.filesystemService, sourcePaths, destinationPath, 'copy')
    return getCopyMoveConflicts(sources, destination, candidates)
  }

  copy(operationId: string, sourcePaths: string[], destinationPath: string, policy: ConflictPolicy, signal: AbortSignal): Promise<void> {
    return this.filesystemService.runTransferMutation(operationId, async () => {
      signal.throwIfAborted()
      const { sources, destination, candidates } = await validateCopyMoveSelection(this.filesystemService, sourcePaths, destinationPath, 'copy')
      const targets = await resolveReplacementTargets(destination.absolutePath, candidates, policy)
      validateCopyMoveTargets(sources, destination, targets, 'copy')

      let completedItems = 0
      try {
        for (const [index, source] of sources.entries()) {
          signal.throwIfAborted()
          this.transferService.progress(operationId, completedItems, basename(source.virtualPath))
          const cleanupFailure = await copyPreparedItem(source, targets[index], operationId, index, signal)
          completedItems += 1
          this.transferService.progress(operationId, completedItems, basename(source.virtualPath))
          if (cleanupFailure) throw cleanupFailure
        }
        signal.throwIfAborted()
      } catch (error) {
        if (completedItems > 0) {
          const cause = error instanceof ApiException ? error.message : 'The operation failed.'
          throw new ApiException(
            'operation_failed',
            `The copy stopped after ${completedItems} of ${sources.length} items. ${cause}`,
            HttpStatus.INTERNAL_SERVER_ERROR
          )
        }
        throw error
      }
    })
  }
}

export async function copyPreparedItem(
  source: ValidatedPath,
  target: PreparedDestination,
  operationId: string,
  index: number,
  signal: AbortSignal
): Promise<ApiException | undefined> {
  const preparedPath = await unusedInternalPath(dirname(target.path), 'tmp', operationId, index + 1)
  try {
    await cp(source.absolutePath, preparedPath, { errorOnExist: true, force: false, recursive: source.isDirectory })
    signal.throwIfAborted()
    return await promotePreparedReplacement(preparedPath, target, operationId, index)
  } catch (error) {
    await rm(preparedPath, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}
