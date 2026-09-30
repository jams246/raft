export type ApiErrorCode =
  | 'invalid_path'
  | 'not_found'
  | 'permission_denied'
  | 'unsupported'
  | 'protected_root'
  | 'conflict'
  | 'operation_busy'
  | 'operation_failed'
  | 'invalid_request'
  | 'insufficient_storage'

export interface ApiError {
  error: ApiErrorCode
  message: string
}

export interface ApiHealth {
  status: 'ok'
  warnings?: string[]
}
