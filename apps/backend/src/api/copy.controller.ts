import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { basename } from 'node:path'
import { ApiException } from './api-exception.js'
import { parseCopyMoveRequest } from './copy-move-request.js'
import { CopyFilesystemService } from '../filesystem/copy-filesystem.service.js'
import { TransferService } from '../transfers/transfer.service.js'

@Controller()
export class CopyController {
  constructor(
    private readonly copyFilesystemService: CopyFilesystemService,
    private readonly transferService: TransferService
  ) {}

  @Post('copy/preflight')
  @HttpCode(HttpStatus.OK)
  async preflight(@Body() body: unknown): Promise<{ conflicts: Awaited<ReturnType<CopyFilesystemService['preflight']>> }> {
    const request = parseCopyMoveRequest(body, false, 'copy')
    const conflicts = await this.copyFilesystemService.preflight(request.sources, request.destination)
    return { conflicts }
  }

  @Post('copy')
  @HttpCode(HttpStatus.OK)
  async copy(@Body() body: unknown): Promise<void> {
    const request = parseCopyMoveRequest(body, true, 'copy')
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
