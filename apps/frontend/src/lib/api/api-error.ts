import type { ApiErrorCode } from '@raft/shared'
import { isMemberOf, isRecord } from './validation'

// Record<ApiErrorCode, true> fails to compile when a code is added to the shared union but not listed here.
export const isApiErrorCode = isMemberOf<ApiErrorCode>({
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
})

/**
 * A failed Raft API request whose `message` is safe to show to the user.
 *
 * `code` is the API's stable error code when the server returned a valid error body, and `status` is the HTTP status
 * when a response was received. Both are undefined for network failures and timeouts.
 */
export class ApiRequestError extends Error {
  readonly code: ApiErrorCode | undefined
  readonly status: number | undefined

  constructor(message: string, details: { code?: ApiErrorCode | undefined; status?: number | undefined; cause?: unknown } = {}) {
    super(message, { cause: details.cause })
    this.name = 'ApiRequestError'
    this.code = details.code
    this.status = details.status
  }
}

/**
 * Converts an unsuccessful response into an {@link ApiRequestError}.
 *
 * The body's `message` is shown when it is a string and `code` is set only for a known API error code; each field is
 * validated on its own so a server message is still shown when the code is missing or newer than this client.
 */
export async function toApiRequestError(response: Response, fallbackMessage: string): Promise<ApiRequestError> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    // A missing or non-JSON error body still reports the HTTP status with the fallback message.
    body = undefined
  }
  const message = isRecord(body) && typeof body.message === 'string' ? body.message : fallbackMessage
  const code = isRecord(body) && isApiErrorCode(body.error) ? body.error : undefined
  return new ApiRequestError(message, { code, status: response.status })
}
