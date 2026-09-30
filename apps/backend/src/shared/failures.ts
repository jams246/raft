export type FailureKind =
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
  | 'source_changed'
  | 'cancelled'

export class Failure extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string
  ) {
    super(message)
    this.name = 'Failure'
  }
}

export function toFailure(error: unknown): Failure {
  return error instanceof Failure ? error : new Failure('operation_failed', 'The operation failed.')
}

export function withFailure(failure: Failure, context: string, cleanupFailure?: Failure): Failure {
  const cleanupMessage = cleanupFailure === undefined ? '' : ` Cleanup also failed: ${cleanupFailure.message}`
  return new Failure(failure.kind, `${context} ${failure.message}${cleanupMessage}`)
}
