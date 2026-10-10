export type UnknownRecord = Readonly<Record<string, unknown>>

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Builds a membership check for a closed string union whose members are listed in `members`. */
export function isMemberOf<const T extends string>(members: Readonly<Record<T, true>>): (value: unknown) => value is T {
  return (value: unknown): value is T => typeof value === 'string' && Object.hasOwn(members, value)
}

export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** Decodes every element of an array, or returns undefined when the value is not an array or any element is invalid. */
export function decodeArray<T>(value: unknown, decode: (item: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(value)) return undefined
  const decoded: T[] = []
  for (const item of value) {
    const result = decode(item)
    if (result === undefined) return undefined
    decoded.push(result)
  }
  return decoded
}
