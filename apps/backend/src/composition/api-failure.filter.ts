import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common'
import type { ApiError } from '@raft/shared'
import type { Response } from 'express'
import { isApiErrorCode, toApiFailureResponse } from '../FileManagement/Presentation/api-failures.js'
import { toFailure } from '../shared/failures.js'

const PAYLOAD_TOO_LARGE = 413
const payloadTooLargeError: ApiError = { error: 'invalid_request', message: 'The request is too large.' }

const httpErrorsByStatus: Partial<Record<number, ApiError>> = {
  400: { error: 'invalid_request', message: 'The request is invalid.' },
  403: { error: 'permission_denied', message: 'Permission denied.' },
  404: { error: 'not_found', message: 'The requested resource was not found.' },
  [PAYLOAD_TOO_LARGE]: payloadTooLargeError,
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
  if (isPayloadTooLarge(exception)) return { status: PAYLOAD_TOO_LARGE, body: payloadTooLargeError }
  if (!(exception instanceof HttpException)) return undefined
  const status = exception.getStatus()
  const response = exception.getResponse()
  if (typeof response === 'object' && response !== null && 'error' in response && isApiErrorCode(response.error)) {
    const message = 'message' in response && typeof response.message === 'string' ? response.message : exception.message
    return { status, body: { error: response.error, message } }
  }
  return { status, body: httpErrorsByStatus[status] ?? { error: 'operation_failed', message: 'The operation failed.' } }
}

// Express body parsers reject oversized bodies with plain errors rather than Nest HttpExceptions.
function isPayloadTooLarge(exception: unknown): boolean {
  return typeof exception === 'object' && exception !== null && 'type' in exception && exception.type === 'entity.too.large'
}
