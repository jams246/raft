import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common'
import type { ApiError, ApiErrorCode } from '@raft/shared'
import type { Response } from 'express'
import { Failure, toFailure, type FailureKind } from './failures.js'

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

const httpErrorsByStatus: Partial<Record<number, ApiError>> = {
  400: { error: 'invalid_request', message: 'The request is invalid.' },
  403: { error: 'permission_denied', message: 'Permission denied.' },
  404: { error: 'not_found', message: 'The requested resource was not found.' },
  507: { error: 'insufficient_storage', message: 'The destination does not have enough free space for this operation.' }
}

@Catch()
export class ApiFailureFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()
    const httpResponse = toHttpFailureResponse(exception)
    if (httpResponse) {
      response.status(httpResponse.status).json(httpResponse.body)
      return
    }

    const failure = toFailure(exception)
    const mapped = toApiFailureResponse(failure)
    response.status(mapped.status).json(mapped.body)
  }
}

function toHttpFailureResponse(exception: unknown): { status: number; body: ApiError } | undefined {
  if (!(exception instanceof HttpException)) return
  const status = exception.getStatus()
  const response = exception.getResponse()
  if (typeof response === 'object' && response !== null && 'error' in response && isApiErrorCode(response.error)) {
    const message = 'message' in response && typeof response.message === 'string' ? response.message : exception.message
    return { status, body: { error: response.error, message } }
  }
  return { status, body: httpErrorsByStatus[status] ?? { error: 'operation_failed', message: 'The operation failed.' } }
}

export function toApiFailureResponse(failure: Failure): { status: number; body: ApiError } {
  const mapped = failureResponses[failure.kind]
  return { status: mapped.status, body: { error: mapped.code, message: failure.message } }
}

export function toApiErrorCode(failure: Failure): ApiErrorCode {
  return failureResponses[failure.kind].code
}

export function toPresentationFailure(exception: unknown): Failure | undefined {
  if (!(exception instanceof HttpException)) return
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
    case 400:
      return new Failure('invalid_request', message)
    case 403:
      return new Failure('permission_denied', message)
    case 404:
      return new Failure('not_found', message)
    case 507:
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

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (
    value === 'invalid_path' ||
    value === 'not_found' ||
    value === 'permission_denied' ||
    value === 'unsupported' ||
    value === 'protected_root' ||
    value === 'conflict' ||
    value === 'operation_busy' ||
    value === 'operation_failed' ||
    value === 'invalid_request' ||
    value === 'insufficient_storage'
  )
}

function failureKind(code: ApiErrorCode, status: number): FailureKind {
  if (code === 'operation_failed' && status === 409) return 'source_changed'
  return code
}
