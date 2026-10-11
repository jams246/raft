import { HttpException } from '@nestjs/common'
import type { ApiError, ApiErrorCode } from '@raft/shared'
import { Failure, type FailureKind } from '../../shared/failures.js'

const failureResponses: Record<FailureKind, { code: ApiErrorCode; status: number }> = {
  invalid_path: { code: 'invalid_path', status: 400 },
  not_found: { code: 'not_found', status: 404 },
  permission_denied: { code: 'permission_denied', status: 403 },
  unsupported: { code: 'unsupported', status: 400 },
  protected_root: { code: 'protected_root', status: 400 },
  conflict: { code: 'conflict', status: 409 },
  operation_busy: { code: 'operation_busy', status: 409 },
  operation_failed: { code: 'operation_failed', status: 500 },
  invalid_request: { code: 'invalid_request', status: 400 },
  insufficient_storage: { code: 'insufficient_storage', status: 507 },
  source_changed: { code: 'operation_failed', status: 409 },
  cancelled: { code: 'operation_failed', status: 409 }
}

export function toApiFailureResponse(failure: Failure): { status: number; body: ApiError } {
  const mapped = failureResponses[failure.kind]
  return { status: mapped.status, body: { error: mapped.code, message: failure.message } }
}

export function toApiErrorCode(failure: Failure): ApiErrorCode {
  return failureResponses[failure.kind].code
}

export function toPresentationFailure(exception: unknown): Failure | undefined {
  if (!(exception instanceof HttpException)) return undefined
  const status = exception.getStatus()
  const response = exception.getResponse()
  if (typeof response === 'object' && response !== null && 'error' in response && isApiErrorCode(response.error)) {
    const message = 'message' in response && typeof response.message === 'string' ? response.message : exception.message
    return new Failure(failureKind(response.error, status), message)
  }
  return statusFailure(status, getMessage(response, exception.message))
}

function statusFailure(status: number, message: string): Failure {
  switch (status) {
    case failureResponses.invalid_request.status:
      return new Failure('invalid_request', message)
    case failureResponses.permission_denied.status:
      return new Failure('permission_denied', message)
    case failureResponses.not_found.status:
      return new Failure('not_found', message)
    case failureResponses.insufficient_storage.status:
      return new Failure('insufficient_storage', message)
    default:
      return new Failure('operation_failed', 'The operation failed.')
  }
}

function getMessage(response: string | object, fallback: string): string {
  if (typeof response === 'string') return response
  if (!('message' in response)) return fallback
  if (typeof response.message === 'string') return response.message
  if (Array.isArray(response.message)) return response.message.join(' ')
  return fallback
}

// Record<ApiErrorCode, true> fails to compile when a code is added to the shared union but not listed here.
const API_ERROR_CODES = {
  invalid_path: true,
  not_found: true,
  permission_denied: true,
  unsupported: true,
  protected_root: true,
  conflict: true,
  operation_busy: true,
  operation_failed: true,
  invalid_request: true,
  insufficient_storage: true
} satisfies Record<ApiErrorCode, true>

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && Object.hasOwn(API_ERROR_CODES, value)
}

function failureKind(code: ApiErrorCode, status: number): FailureKind {
  if (code === 'operation_failed' && status === failureResponses.conflict.status) return 'source_changed'
  return code
}
