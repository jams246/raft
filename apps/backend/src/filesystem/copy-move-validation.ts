import { HttpStatus } from '@nestjs/common'
import type { CopyConflict } from '@raft/shared'
import { basename } from 'node:path'
import { ApiException } from '../api/api-exception.js'
import type { FilesystemService } from './filesystem.service.js'
import { resolveVirtualPath, validateVirtualPath } from './paths.js'
import type { ValidatedPath } from './paths.js'
import { getConflicts } from './prepared-replacement.js'
import type { ReplacementCandidate } from './prepared-replacement.js'

export async function validateCopyMoveSelection(filesystemService: FilesystemService, sourcePaths: string[], destinationPath: string, kind: 'copy' | 'move') {
  const action = kind === 'copy' ? 'copied' : 'moved'
  if (sourcePaths.length === 0) throw invalidRequest(kind)
  const sources = await Promise.all(
    sourcePaths.map(async (sourcePath) => {
      const components = validateVirtualPath(sourcePath)
      if (components.length <= 1) {
        throw new ApiException('protected_root', `Root entries cannot be ${action}.`, HttpStatus.BAD_REQUEST)
      }
      return filesystemService.validateExistingPath(sourcePath)
    })
  )
  if (new Set(sources.map((source) => source.virtualPath)).size !== sources.length) throw invalidRequest(kind)
  if (destinationPath === '/') {
    throw new ApiException('protected_root', `${kind === 'copy' ? 'Copies' : 'Moves'} cannot target the root.`, HttpStatus.BAD_REQUEST)
  }
  const destination = await resolveVirtualPath(destinationPath)
  if (!destination.isDirectory) {
    throw new ApiException('invalid_path', `The requested ${kind} directory is invalid.`, HttpStatus.BAD_REQUEST)
  }
  for (const source of sources) {
    if (source.isDirectory && isSameOrDescendant(destination.virtualPath, source.virtualPath)) {
      throw new ApiException('invalid_request', `A directory cannot be ${action} into itself or a descendant.`, HttpStatus.BAD_REQUEST)
    }
  }
  const candidates: ReplacementCandidate[] = sources.map((source) => ({
    name: basename(source.absolutePath),
    type: source.isDirectory ? 'directory' : 'file'
  }))
  if (new Set(candidates.map((candidate) => candidate.name)).size !== candidates.length) {
    throw new ApiException('invalid_request', 'Selected items must have unique names.', HttpStatus.BAD_REQUEST)
  }
  return { sources, destination, candidates }
}

export async function getCopyMoveConflicts(sources: ValidatedPath[], destination: ValidatedPath, candidates: ReplacementCandidate[]): Promise<CopyConflict[]> {
  const conflicts = await getConflicts(destination.absolutePath, candidates)
  const conflictsByName = new Map(conflicts.map((conflict) => [conflict.name, conflict.suggestedName]))
  return sources.flatMap((source, index) => {
    const suggestedName = conflictsByName.get(candidates[index].name)
    return suggestedName ? [{ source: source.virtualPath, existingName: candidates[index].name, suggestedName }] : []
  })
}

export function validateCopyMoveTargets(sources: ValidatedPath[], destination: ValidatedPath, targets: Array<{ name: string }>, kind: 'copy' | 'move'): void {
  for (const target of targets) {
    const targetPath = `${destination.virtualPath}/${target.name}`
    if (sources.some((source) => isSameOrDescendant(source.virtualPath, targetPath) || isSameOrDescendant(targetPath, source.virtualPath))) {
      throw new ApiException('invalid_request', `A ${kind} destination cannot overlap a selected source.`, HttpStatus.BAD_REQUEST)
    }
  }
}

function isSameOrDescendant(path: string, parentPath: string): boolean {
  return path === parentPath || path.startsWith(`${parentPath}/`)
}

function invalidRequest(kind: 'copy' | 'move'): ApiException {
  return new ApiException('invalid_request', `The ${kind} request is invalid.`, HttpStatus.BAD_REQUEST)
}
