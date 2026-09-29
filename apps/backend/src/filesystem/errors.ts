import { HttpStatus } from '@nestjs/common'
import { ApiException } from '../api/api-exception.js'

export function toFilesystemException(error: unknown): ApiException {
  if (error instanceof ApiException) return error

  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
  if (code === 'EEXIST') {
    return new ApiException('conflict', 'An item with that name already exists.', HttpStatus.CONFLICT)
  }
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return new ApiException('not_found', 'The requested path was not found.', HttpStatus.NOT_FOUND)
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return new ApiException('permission_denied', 'Permission denied.', HttpStatus.FORBIDDEN)
  }
  return new ApiException('operation_failed', 'The operation failed.', HttpStatus.INTERNAL_SERVER_ERROR)
}
