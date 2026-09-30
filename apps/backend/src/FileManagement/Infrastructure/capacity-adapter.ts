import { Logger } from '@nestjs/common'
import { statfs } from 'node:fs/promises'
import { Failure } from '../../shared/failures.js'
import type { CapacityPort } from '../Application/ports.js'
import { withFilesystemFailure } from './filesystem-failures.js'

const DEFAULT_RESERVE_BYTES = 1024n ** 3n
const MAX_SAFE_BYTES = BigInt(Number.MAX_SAFE_INTEGER)
const UNIT_BYTES: Record<string, bigint> = {
  B: 1n,
  KB: 1000n,
  MB: 1000n ** 2n,
  GB: 1000n ** 3n,
  TB: 1000n ** 4n,
  KIB: 1024n,
  MIB: 1024n ** 2n,
  GIB: 1024n ** 3n,
  TIB: 1024n ** 4n
}

export class CapacityAdapter implements CapacityPort {
  readonly warning?: string
  private readonly reserveBytes: bigint

  constructor() {
    const configured = process.env.MIN_FREE_SPACE
    const parsed = configured === undefined ? DEFAULT_RESERVE_BYTES : parseMinimumFreeSpace(configured)
    if (parsed === undefined) {
      this.reserveBytes = DEFAULT_RESERVE_BYTES
      this.warning = 'Invalid MIN_FREE_SPACE value. Using the default 1GiB free-space reserve.'
      new Logger(CapacityAdapter.name).warn(this.warning)
    } else {
      this.reserveBytes = parsed
    }
  }

  async assertAvailable(destinationPath: string, requiredBytes: bigint): Promise<void> {
    let availableBytes: bigint
    try {
      const filesystem = await statfs(destinationPath, { bigint: true })
      availableBytes = filesystem.bavail * filesystem.bsize
    } catch (error) {
      throw withFilesystemFailure(
        error,
        'Could not check destination free space. Check filesystem availability and permissions, then retry. The write was blocked.'
      )
    }
    if (availableBytes < requiredBytes + this.reserveBytes) {
      throw new Failure('insufficient_storage', 'The destination does not have enough free space for this operation and its MIN_FREE_SPACE reserve.')
    }
  }
}

export function parseMinimumFreeSpace(value: string): bigint | undefined {
  const text = value.trim()
  if (!text || text.length > 128) return
  const match = /^(?:(\d+)(?:\.(\d+))?|\.(\d+))\s*(B|KB|MB|GB|TB|KIB|MIB|GIB|TIB)?$/i.exec(text)
  if (!match) return
  const whole = BigInt(match[1] ?? '0')
  const fraction = match[2] ?? match[3] ?? ''
  const denominator = 10n ** BigInt(fraction.length)
  const numerator = (whole * denominator + BigInt(fraction || '0')) * UNIT_BYTES[(match[4] ?? 'B').toUpperCase()]
  if (numerator % denominator !== 0n) return
  const bytes = numerator / denominator
  return bytes <= MAX_SAFE_BYTES ? bytes : undefined
}
