import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import type { ApiError } from '@raft/shared'
import type { Response } from 'express'
import { ApiException } from './api-exception.js'
import { toFilesystemException } from '../filesystem/errors.js'

const errorsByStatus: Partial<Record<number, ApiError>> = {
  [HttpStatus.NOT_FOUND]: {
    error: 'not_found',
    message: 'The requested resource was not found.'
  },
  [HttpStatus.FORBIDDEN]: {
    error: 'permission_denied',
    message: 'Permission denied.'
  },
  [HttpStatus.BAD_REQUEST]: {
    error: 'invalid_request',
    message: 'The request is invalid.'
  },
  [HttpStatus.INSUFFICIENT_STORAGE]: {
    error: 'insufficient_storage',
    message: 'The destination does not have enough free space for this operation.'
  }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp()
    const response = context.getResponse<Response>()

    if (exception instanceof ApiException || !(exception instanceof HttpException)) {
      const failure = toFilesystemException(exception)
      response.status(failure.getStatus()).json(failure.getResponse())
      return
    }

    const status = exception.getStatus()
    const body: ApiError = errorsByStatus[status] ?? {
      error: 'operation_failed',
      message: 'The operation failed.'
    }

    response.status(status).json(body)
  }
}
