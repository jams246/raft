import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { basename } from 'node:path'
import { parseCopyMoveRequest } from './copy-move-request.js'
import { MoveFilesystemService } from '../filesystem/move-filesystem.service.js'
import { TransferService } from '../transfers/transfer.service.js'
import { toFilesystemException } from '../filesystem/errors.js'

@Controller()
export class MoveController {
  constructor(
    private readonly moveFilesystemService: MoveFilesystemService,
    private readonly transferService: TransferService
  ) {}

  @Post('move/preflight')
  @HttpCode(HttpStatus.OK)
  async preflight(@Body() body: unknown): Promise<{ conflicts: Awaited<ReturnType<MoveFilesystemService['preflight']>> }> {
    const request = parseCopyMoveRequest(body, false, 'move')
    const conflicts = await this.moveFilesystemService.preflight(request.sources, request.destination)
    return { conflicts }
  }

  @Post('move')
  @HttpCode(HttpStatus.OK)
  async move(@Body() body: unknown): Promise<void> {
    const request = parseCopyMoveRequest(body, true, 'move')
    const operation = this.transferService.reserveMove(request.sources.length, basename(request.destination))
    try {
      await this.moveFilesystemService.move(
        operation.id,
        request.sources,
        request.destination,
        request.conflictPolicy,
        this.transferService.getSignal(operation.id)
      )
      this.transferService.complete(operation.id)
    } catch (error) {
      const failure = toFilesystemException(error)
      this.transferService.fail(operation.id, failure.message, failure.apiErrorCode)
      throw failure
    }
  }
}
