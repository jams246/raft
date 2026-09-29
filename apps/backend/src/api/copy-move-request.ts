import { HttpStatus } from '@nestjs/common'
import type { ConflictPolicy } from '@raft/shared'
import { ApiException } from './api-exception.js'

interface CopyMoveRequest {
  sources: string[]
  destination: string
  conflictPolicy: ConflictPolicy
}

export function parseCopyMoveRequest(value: unknown, requirePolicy: boolean, kind: 'copy' | 'move'): CopyMoveRequest {
  if (
    !isRecord(value) ||
    !Array.isArray(value.sources) ||
    value.sources.length === 0 ||
    !value.sources.every((source) => typeof source === 'string') ||
    typeof value.destination !== 'string' ||
    (requirePolicy && value.conflictPolicy !== 'rename' && value.conflictPolicy !== 'overwrite')
  ) {
    throw new ApiException('invalid_request', `The ${kind} request is invalid.`, HttpStatus.BAD_REQUEST)
  }

  return {
    sources: value.sources,
    destination: value.destination,
    conflictPolicy: value.conflictPolicy === 'overwrite' ? 'overwrite' : 'rename'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
