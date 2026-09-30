import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import type { CopyConflict } from '@raft/shared'
import { CopyMoveUseCases } from '../Application/copy-move-use-cases.js'
import { parseCopyMoveRequest } from './copy-move-request.js'

@Controller()
export class CopyController {
  constructor(private readonly copyMove: CopyMoveUseCases) {}

  @Post('copy/preflight')
  @HttpCode(HttpStatus.OK)
  async preflight(@Body() body: unknown): Promise<{ conflicts: CopyConflict[] }> {
    const request = parseCopyMoveRequest(body, false, 'copy')
    const conflicts = await this.copyMove.preflight(request.sources, request.destination, 'copy')
    return { conflicts: conflicts.map(({ source, existingName, suggestedName }) => ({ source, existingName, suggestedName })) }
  }

  @Post('copy')
  @HttpCode(HttpStatus.OK)
  async copy(@Body() body: unknown): Promise<void> {
    const request = parseCopyMoveRequest(body, true, 'copy')
    return this.copyMove.copy(request.sources, request.destination, request.conflictPolicy)
  }
}
