import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import type { ApiError, ApiErrorCode } from '@raft/shared'
import type { Response } from 'express'
import { ApiException } from './api-exception.js'
import { toFilesystemException } from '../filesystem/errors.js'

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
    const error = this.getErrorCode(status)
    const body: ApiError = {
      error,
      message: this.getMessage(error)
    }

    response.status(status).json(body)
  }

  private getErrorCode(status: number): ApiErrorCode {
    if (status === HttpStatus.NOT_FOUND) return 'not_found'
    if (status === HttpStatus.FORBIDDEN) return 'permission_denied'
    if (status === HttpStatus.BAD_REQUEST) return 'invalid_request'
    if (status === HttpStatus.INSUFFICIENT_STORAGE) return 'insufficient_storage'
    return 'operation_failed'
  }

  private getMessage(error: ApiErrorCode): string {
    if (error === 'not_found') return 'The requested resource was not found.'
    if (error === 'permission_denied') return 'Permission denied.'
    if (error === 'invalid_request') return 'The request is invalid.'
    if (error === 'insufficient_storage') return 'The destination does not have enough free space for this operation.'
    return 'The operation failed.'
  }
}
