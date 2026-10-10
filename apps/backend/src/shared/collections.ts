/**
 * Reads an element that an invariant guarantees exists, such as a value from an array built in parallel with another.
 *
 * @throws RangeError if the index is outside the array, which indicates a broken invariant rather than user input.
 */
export function elementAt<T>(values: readonly T[], index: number): T {
  const value = values[index]
  if (value === undefined) throw new RangeError(`Expected an element at index ${index} of ${values.length}.`)
  return value
}
