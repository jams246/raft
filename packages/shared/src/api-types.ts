export type ApiErrorCode = 'invalid_path' | 'not_found' | 'permission_denied' | 'unsupported' | 'operation_failed' | 'invalid_request'

export interface ApiError {
  error: ApiErrorCode
  message: string
}

export interface ApiHealth {
  status: 'ok'
}
