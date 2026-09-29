import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import type { ConflictPolicy } from '@raft/shared'
import { basename } from 'node:path'
import { ApiException } from './api-exception.js'
import { CopyFilesystemService } from '../filesystem/copy-filesystem.service.js'
import { TransferService } from '../transfers/transfer.service.js'

interface CopyRequest {
  sources: string[]
  destination: string
  conflictPolicy: ConflictPolicy
}

@Controller()
export class CopyController {
  constructor(
    private readonly copyFilesystemService: CopyFilesystemService,
    private readonly transferService: TransferService
  ) {}

  @Post('copy/preflight')
  @HttpCode(HttpStatus.OK)
  async preflight(@Body() body: unknown): Promise<{ conflicts: Awaited<ReturnType<CopyFilesystemService['preflight']>> }> {
    const request = parseCopyRequest(body, false)
    const conflicts = await this.copyFilesystemService.preflight(request.sources, request.destination)
    return { conflicts }
  }

  @Post('copy')
  @HttpCode(HttpStatus.OK)
  async copy(@Body() body: unknown): Promise<void> {
    const request = parseCopyRequest(body, true)
    const operation = this.transferService.reserveCopy(request.sources.length, basename(request.destination))
    try {
      await this.copyFilesystemService.copy(
        operation.id,
        request.sources,
        request.destination,
        request.conflictPolicy,
        this.transferService.getSignal(operation.id)
      )
      this.transferService.complete(operation.id)
    } catch (error) {
      this.transferService.fail(operation.id, error instanceof ApiException ? error.message : 'The copy could not be completed.')
      throw error
    }
  }
}

function parseCopyRequest(value: unknown, requirePolicy: boolean): CopyRequest {
  if (
    !isRecord(value) ||
    !Array.isArray(value.sources) ||
    value.sources.length === 0 ||
    !value.sources.every((source) => typeof source === 'string') ||
    typeof value.destination !== 'string' ||
    (requirePolicy && value.conflictPolicy !== 'rename' && value.conflictPolicy !== 'overwrite')
  ) {
    throw new ApiException('invalid_request', 'The copy request is invalid.', HttpStatus.BAD_REQUEST)
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
