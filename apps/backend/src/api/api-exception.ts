import { HttpException, HttpStatus } from '@nestjs/common'
import type { ApiError, ApiErrorCode } from '@raft/shared'

export class ApiException extends HttpException {
  constructor(
    readonly apiErrorCode: ApiErrorCode,
    message: string,
    status: HttpStatus
  ) {
    super({ error: apiErrorCode, message } satisfies ApiError, status)
  }
}
