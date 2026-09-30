import { Failure, withFailure } from '../../shared/failures.js'

export function toFilesystemFailure(error: unknown): Failure {
  if (error instanceof Failure) return error
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
  switch (code) {
    case 'EEXIST':
      return new Failure('conflict', 'An item with that name already exists.')
    case 'ENOENT':
    case 'ENOTDIR':
      return new Failure('not_found', 'The requested path was not found.')
    case 'EACCES':
    case 'EPERM':
    case 'EROFS':
      return new Failure('permission_denied', 'Permission denied.')
    case 'ENOSPC':
    case 'EDQUOT':
      return new Failure('insufficient_storage', 'The destination does not have enough free space for this operation.')
    default:
      return new Failure('operation_failed', 'The operation failed.')
  }
}

export function withFilesystemFailure(error: unknown, context: string, cleanupError?: unknown): Failure {
  const failure = toFilesystemFailure(error)
  return withFailure(failure, context, cleanupError === undefined ? undefined : toFilesystemFailure(cleanupError))
}

export function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}
