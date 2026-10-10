import { ApiRequestError, toApiRequestError } from './api-error'

/** Default per-request limit, in milliseconds, for requests whose server work is bounded and short. */
export const API_REQUEST_TIMEOUT_MS = 30_000

export interface ApiRequestOptions extends Omit<RequestInit, 'signal'> {
  /** Message shown to the user when the server gives no usable error message. */
  failureMessage: string
  /** Cancels the request and the body read. Cancellation rejects with the signal's reason and is not converted. */
  signal?: AbortSignal | undefined
  /**
   * Milliseconds before the request is aborted as timed out, or `null` for a request that lasts as long as a
   * user-sized transfer. Those requests are bounded by the transfer's cancel flow instead.
   */
  timeoutMs: number | null
}

/** Builds a POST request with a JSON body. */
export function jsonPost(body: unknown): Pick<RequestInit, 'method' | 'headers' | 'body'> {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

/**
 * Sends a Raft API request whose successful response has no body the caller needs.
 *
 * @throws ApiRequestError for an unsuccessful status, a network failure, or a timeout.
 * @throws The caller signal's reason when the caller cancels.
 */
export function apiRequest(url: string, options: ApiRequestOptions): Promise<void> {
  return send(url, options, async (response) => {
    await response.body?.cancel()
  })
}

/**
 * Sends a Raft API request and validates its JSON response with `decode`.
 *
 * @param decode - Returns the domain value, or undefined when the payload does not match the endpoint contract.
 * @throws ApiRequestError for an unsuccessful status, a network failure, a timeout, or a payload `decode` rejects.
 * @throws The caller signal's reason when the caller cancels.
 */
export function apiJson<T>(url: string, options: ApiRequestOptions, decode: (value: unknown) => T | undefined): Promise<T> {
  return send(url, options, async (response) => {
    const value: unknown = await response.json()
    const decoded = decode(value)
    if (decoded === undefined) throw new ApiRequestError(`${options.failureMessage} The server returned an unexpected response.`, { status: response.status })
    return decoded
  })
}

async function send<T>(url: string, options: ApiRequestOptions, read: (response: Response) => Promise<T>): Promise<T> {
  const { failureMessage, signal: callerSignal, timeoutMs, ...init } = options
  const signal = combineSignals(callerSignal, timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal })
    if (!response.ok) throw await toApiRequestError(response, failureMessage)
    return await read(response)
  } catch (error: unknown) {
    if (error instanceof ApiRequestError || callerSignal?.aborted === true) throw error
    if (error instanceof SyntaxError) throw new ApiRequestError(`${failureMessage} The server returned an unexpected response.`, { cause: error })
    if (signal?.aborted === true) throw new ApiRequestError(`${failureMessage} The request timed out. Try again.`, { cause: error })
    throw new ApiRequestError(`${failureMessage} Check the connection and try again.`, { cause: error })
  }
}

function combineSignals(callerSignal: AbortSignal | undefined, timeoutMs: number | null): AbortSignal | null {
  if (timeoutMs === null) return callerSignal ?? null
  const timeout = AbortSignal.timeout(timeoutMs)
  return callerSignal === undefined ? timeout : AbortSignal.any([callerSignal, timeout])
}
