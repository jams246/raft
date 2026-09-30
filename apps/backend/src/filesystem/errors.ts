import { HttpException, HttpStatus } from '@nestjs/common'
import { ApiException } from '../api/api-exception.js'

export function toFilesystemException(error: unknown): ApiException {
  if (error instanceof ApiException) return error
  if (error instanceof HttpException) {
    const status = error.getStatus()
    const response = error.getResponse()
    const message = getHttpExceptionMessage(response) ?? error.message
    if (status === HttpStatus.BAD_REQUEST) return new ApiException('invalid_request', message, HttpStatus.BAD_REQUEST)
    if (status === HttpStatus.NOT_FOUND) return new ApiException('not_found', message, HttpStatus.NOT_FOUND)
    if (status === HttpStatus.FORBIDDEN) return new ApiException('permission_denied', message, HttpStatus.FORBIDDEN)
    if (status === HttpStatus.INSUFFICIENT_STORAGE) return new ApiException('insufficient_storage', message, HttpStatus.INSUFFICIENT_STORAGE)
  }

  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
  if (code === 'EEXIST') {
    return new ApiException('conflict', 'An item with that name already exists.', HttpStatus.CONFLICT)
  }
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return new ApiException('not_found', 'The requested path was not found.', HttpStatus.NOT_FOUND)
  }
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
    return new ApiException('permission_denied', 'Permission denied.', HttpStatus.FORBIDDEN)
  }
  if (code === 'ENOSPC' || code === 'EDQUOT') {
    return new ApiException('insufficient_storage', 'The destination does not have enough free space for this operation.', HttpStatus.INSUFFICIENT_STORAGE)
  }
  return new ApiException('operation_failed', 'The operation failed.', HttpStatus.INTERNAL_SERVER_ERROR)
}

function getHttpExceptionMessage(response: string | object): string | undefined {
  if (typeof response === 'string') return response
  if (!('message' in response)) return
  if (typeof response.message === 'string') return response.message
  if (Array.isArray(response.message)) return response.message.join(' ')
}

export function withFilesystemFailure(error: unknown, context: string, cleanupError?: unknown): ApiException {
  const failure = toFilesystemException(error)
  const cleanupMessage = cleanupError === undefined ? '' : ` Cleanup also failed: ${toFilesystemException(cleanupError).message}`
  return new ApiException(failure.apiErrorCode, `${context} ${failure.message}${cleanupMessage}`, failure.getStatus() as HttpStatus)
}
