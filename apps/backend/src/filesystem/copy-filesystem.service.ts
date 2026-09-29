import { HttpStatus, Injectable } from '@nestjs/common'
import type { ConflictPolicy, CopyConflict } from '@raft/shared'
import { cp, rm } from 'node:fs/promises'
import { basename } from 'node:path'
import { ApiException } from '../api/api-exception.js'
import { TransferService } from '../transfers/transfer.service.js'
import { FilesystemService } from './filesystem.service.js'
import { getConflicts, promotePreparedReplacement, resolveReplacementTargets, unusedInternalPath } from './prepared-replacement.js'
import type { PreparedDestination } from './prepared-replacement.js'
import { resolveVirtualPath, validateVirtualPath } from './paths.js'
import type { ValidatedPath } from './paths.js'

@Injectable()
export class CopyFilesystemService {
  constructor(
    private readonly filesystemService: FilesystemService,
    private readonly transferService: TransferService
  ) {}

  async preflight(sourcePaths: string[], destinationPath: string): Promise<CopyConflict[]> {
    const sources = await this.validateSources(sourcePaths)
    const destination = await this.validateDestination(destinationPath)
    this.validateDestinationRelationships(sources, destination)
    const candidates = this.getCandidates(sources)
    const conflicts = await getConflicts(destination.absolutePath, candidates)
    const conflictsByName = new Map(conflicts.map((conflict) => [conflict.name, conflict.suggestedName]))
    return sources.flatMap((source, index) => {
      const suggestedName = conflictsByName.get(candidates[index].name)
      return suggestedName ? [{ source: source.virtualPath, existingName: candidates[index].name, suggestedName }] : []
    })
  }

  copy(operationId: string, sourcePaths: string[], destinationPath: string, policy: ConflictPolicy, signal: AbortSignal): Promise<void> {
    return this.filesystemService.runTransferMutation(operationId, async () => {
      signal.throwIfAborted()
      const sources = await this.validateSources(sourcePaths)
      const destination = await this.validateDestination(destinationPath)
      this.validateDestinationRelationships(sources, destination)
      const candidates = this.getCandidates(sources)
      const targets = await resolveReplacementTargets(destination.absolutePath, candidates, policy)
      this.validateTargetRelationships(sources, destination, targets)

      let preparedPath: string | undefined
      let completedItems = 0
      try {
        for (const [index, source] of sources.entries()) {
          signal.throwIfAborted()
          this.transferService.progress(operationId, completedItems, basename(source.virtualPath))
          preparedPath = await unusedInternalPath(destination.absolutePath, 'tmp', operationId, index + 1)
          await cp(source.absolutePath, preparedPath, { errorOnExist: true, force: false, recursive: source.isDirectory })
          signal.throwIfAborted()
          const cleanupFailure = await promotePreparedReplacement(preparedPath, targets[index], operationId, index)
          preparedPath = undefined
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
      } finally {
        if (preparedPath) await rm(preparedPath, { recursive: true, force: true }).catch(() => undefined)
      }
    })
  }

  private async validateSources(sourcePaths: string[]): Promise<ValidatedPath[]> {
    if (sourcePaths.length === 0) throw invalidCopy()
    const sources = await Promise.all(
      sourcePaths.map(async (sourcePath) => {
        const components = validateVirtualPath(sourcePath)
        if (components.length <= 1) {
          throw new ApiException('protected_root', 'Root entries cannot be copied.', HttpStatus.BAD_REQUEST)
        }
        return this.filesystemService.validateExistingPath(sourcePath)
      })
    )
    if (new Set(sources.map((source) => source.virtualPath)).size !== sources.length) throw invalidCopy()
    return sources
  }

  private async validateDestination(destinationPath: string): Promise<ValidatedPath> {
    if (destinationPath === '/') {
      throw new ApiException('protected_root', 'Copies cannot target the root.', HttpStatus.BAD_REQUEST)
    }
    const destination = await resolveVirtualPath(destinationPath)
    if (!destination.isDirectory) {
      throw new ApiException('invalid_path', 'The requested copy directory is invalid.', HttpStatus.BAD_REQUEST)
    }
    return destination
  }

  private getCandidates(sources: ValidatedPath[]) {
    const candidates = sources.map((source) => ({ name: basename(source.absolutePath), type: source.isDirectory ? ('directory' as const) : ('file' as const) }))
    if (new Set(candidates.map((candidate) => candidate.name)).size !== candidates.length) {
      throw new ApiException('invalid_request', 'Selected items must have unique names.', HttpStatus.BAD_REQUEST)
    }
    return candidates
  }

  private validateDestinationRelationships(sources: ValidatedPath[], destination: ValidatedPath): void {
    for (const source of sources) {
      if (source.isDirectory && isSameOrDescendant(destination.virtualPath, source.virtualPath)) {
        throw new ApiException('invalid_request', 'A directory cannot be copied into itself or a descendant.', HttpStatus.BAD_REQUEST)
      }
    }
  }

  private validateTargetRelationships(sources: ValidatedPath[], destination: ValidatedPath, targets: PreparedDestination[]): void {
    for (const target of targets) {
      const targetPath = `${destination.virtualPath}/${target.name}`
      if (sources.some((source) => pathsOverlap(source.virtualPath, targetPath))) {
        throw new ApiException('invalid_request', 'A copy destination cannot overlap a selected source.', HttpStatus.BAD_REQUEST)
      }
    }
  }
}

function isSameOrDescendant(path: string, parentPath: string): boolean {
  return path === parentPath || path.startsWith(`${parentPath}/`)
}

function pathsOverlap(leftPath: string, rightPath: string): boolean {
  return isSameOrDescendant(leftPath, rightPath) || isSameOrDescendant(rightPath, leftPath)
}

function invalidCopy(): ApiException {
  return new ApiException('invalid_request', 'The copy request is invalid.', HttpStatus.BAD_REQUEST)
}
