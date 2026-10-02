import { Body, Controller, Post, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common'
import { Failure } from '../../shared/failures.js'
import { UploadManagement } from '../Application/upload-management.js'
import type { StoredUploadPart } from '../Application/ports.js'
import { UploadSlotGuard } from './upload-slot.guard.js'
import { UploadInterceptor } from './upload.interceptor.js'
import type { UploadRequest } from './upload-request.js'
import { readUploadManifest } from './upload-request.js'

@Controller()
export class UploadsController {
  constructor(private readonly uploads: UploadManagement) {}

  @Post('upload/preflight')
  async preflight(@Body() body: unknown): Promise<{ conflicts: Array<{ name: string; suggestedName: string }> }> {
    if (
      typeof body !== 'object' ||
      body === null ||
      !('directory' in body) ||
      typeof body.directory !== 'string' ||
      !('manifest' in body) ||
      typeof body.manifest !== 'object' ||
      body.manifest === null ||
      !('items' in body.manifest) ||
      !Array.isArray(body.manifest.items)
    ) {
      throw invalidUpload()
    }
    const conflicts = await this.uploads.preflight(body.directory, body.manifest)
    return { conflicts: conflicts.map(({ name, suggestedName }) => ({ name, suggestedName })) }
  }

  @Post('upload')
  @UseGuards(UploadSlotGuard)
  @UseInterceptors(UploadInterceptor)
  async upload(@UploadedFiles() files: StoredUploadPart[] | undefined, @Req() request: UploadRequest): Promise<void> {
    const upload = request.transferUpload
    if (!upload) throw invalidUpload()
    const policy = request.query.policy
    if (policy !== 'rename' && policy !== 'overwrite') throw invalidUpload()
    while (upload.pendingWrites.size > 0) await Promise.allSettled(upload.pendingWrites)
    await this.uploads.finish(upload.sessionId, readUploadManifest(request), files ?? [], policy)
    upload.cleanupListeners()
  }
}

function invalidUpload(): Failure {
  return new Failure('invalid_request', 'The upload request is invalid.')
}
