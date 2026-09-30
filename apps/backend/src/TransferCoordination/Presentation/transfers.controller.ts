import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { TransferCoordination } from '../Application/transfer-coordination.js'

@Controller()
export class TransfersController {
  constructor(private readonly transferCoordination: TransferCoordination) {}

  @Post('upload/:id/cancel')
  @HttpCode(HttpStatus.ACCEPTED)
  cancelUpload(@Param('id') id: string): void {
    this.transferCoordination.cancel(id, 'upload')
  }

  @Post('copy/:id/cancel')
  @HttpCode(HttpStatus.ACCEPTED)
  cancelCopy(@Param('id') id: string): void {
    this.transferCoordination.cancel(id, 'copy')
  }
}
