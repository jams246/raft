import { Failure } from '../../shared/failures.js'
import { isSameOrDescendant, validateVirtualPath } from './path-policy.js'
import type { ResolvedPath } from './models.js'

export type CopyMoveKind = 'copy' | 'move'

export function validateSelection(sourcePaths: string[], kind: CopyMoveKind): void {
  const action = kind === 'copy' ? 'copied' : 'moved'
  if (sourcePaths.length === 0) throw invalidRequest(kind)
  for (const sourcePath of sourcePaths) {
    if (validateVirtualPath(sourcePath).length <= 1) {
      throw new Failure('protected_root', `Root entries cannot be ${action}.`)
    }
  }
}

export function assertSelectionDestination(sourcePaths: string[], destinationPath: string, kind: CopyMoveKind): void {
  if (new Set(sourcePaths).size !== sourcePaths.length) throw invalidRequest(kind)
  if (destinationPath === '/') {
    throw new Failure('protected_root', `${kind === 'copy' ? 'Copies' : 'Moves'} cannot target the root.`)
  }
  validateVirtualPath(destinationPath)
}

export function assertResolvedDestination(sources: ResolvedPath[], destination: ResolvedPath, kind: CopyMoveKind): void {
  if (!destination.isDirectory) throw new Failure('invalid_path', `The requested ${kind} directory is invalid.`)
  for (const source of sources) {
    if (source.isDirectory && isSameOrDescendant(destination.virtualPath, source.virtualPath)) {
      throw new Failure('invalid_request', `A directory cannot be ${kind === 'copy' ? 'copied' : 'moved'} into itself or a descendant.`)
    }
  }
}

export function validateSourceAndTargetPaths(sourcePaths: string[], targetPaths: string[], kind: CopyMoveKind): void {
  for (const targetPath of targetPaths) {
    if (sourcePaths.some((sourcePath) => isSameOrDescendant(sourcePath, targetPath) || isSameOrDescendant(targetPath, sourcePath))) {
      throw new Failure('invalid_request', `A ${kind} destination cannot overlap a selected source.`)
    }
  }
}

export function assertUniqueNames(names: string[]): void {
  if (new Set(names).size !== names.length) throw new Failure('invalid_request', 'Selected items must have unique names.')
}

function invalidRequest(kind: CopyMoveKind): Failure {
  return new Failure('invalid_request', `The ${kind} request is invalid.`)
}
