import { API_REQUEST_TIMEOUT_MS, apiRequest, jsonPost } from '@/lib/api/api-request'

/**
 * Posts a file mutation and rejects with a user-facing ApiRequestError when it fails.
 *
 * @param timeoutMs - Defaults to the standard API timeout. Pass `null` for mutations whose duration grows with the selection,
 *   because a client timeout cannot stop the server work and would report a failure for a mutation that may still succeed.
 */
export function postFileOperation(url: string, body: object, failureMessage: string, timeoutMs: number | null = API_REQUEST_TIMEOUT_MS): Promise<void> {
  return apiRequest(url, { ...jsonPost(body), failureMessage, timeoutMs })
}
