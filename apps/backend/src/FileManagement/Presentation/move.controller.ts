import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import type { CopyConflict } from '@raft/shared'
import { CopyMoveUseCases } from '../Application/copy-move-use-cases.js'
import { parseCopyMoveRequest } from './copy-move-request.js'

@Controller()
export class MoveController {
  constructor(private readonly copyMove: CopyMoveUseCases) {}

  @Post('move/preflight')
  @HttpCode(HttpStatus.OK)
  async preflight(@Body() body: unknown): Promise<{ conflicts: CopyConflict[] }> {
    const request = parseCopyMoveRequest(body, false, 'move')
    const conflicts = await this.copyMove.preflight(request.sources, request.destination, 'move')
    return { conflicts: conflicts.map(({ source, existingName, suggestedName }) => ({ source, existingName, suggestedName })) }
  }

  @Post('move')
  @HttpCode(HttpStatus.OK)
  async move(@Body() body: unknown): Promise<void> {
    const request = parseCopyMoveRequest(body, true, 'move')
    return this.copyMove.move(request.sources, request.destination, request.conflictPolicy)
  }
}
