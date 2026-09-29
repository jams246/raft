import { HttpException, HttpStatus } from '@nestjs/common'
import type { ApiError, ApiErrorCode } from '@raft/shared'

export class ApiException extends HttpException {
  constructor(error: ApiErrorCode, message: string, status: HttpStatus) {
    super({ error, message } satisfies ApiError, status)
  }
}
