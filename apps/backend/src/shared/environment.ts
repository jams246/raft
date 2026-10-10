const DEFAULT_PORT = 3000
const MAX_PORT = 65_535

/**
 * Parses the HTTP listen port from the `PORT` environment variable.
 *
 * @param text - Decimal digits with optional surrounding whitespace, or undefined when the variable is not set.
 * @returns 3000 when the variable is missing; otherwise an integer from 1 to 65535.
 * @throws TypeError if the value is not decimal digits, including an empty string.
 * @throws RangeError if the port is outside 1 to 65535.
 */
export function parsePort(text: string | undefined): number {
  if (text === undefined) return DEFAULT_PORT
  const normalized = text.trim()
  if (!/^\d+$/.test(normalized)) throw new TypeError('PORT must contain decimal digits.')
  const port = Number(normalized)
  if (port < 1 || port > MAX_PORT) throw new RangeError(`PORT must be from 1 to ${MAX_PORT}.`)
  return port
}
