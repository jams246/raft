import { Body, Controller, HttpCode, HttpStatus, Param, Post, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common'
import { ApiException } from './api-exception.js'
import { UploadSlotGuard } from './upload-slot.guard.js'
import { UploadInterceptor } from './upload.interceptor.js'
import type { StoredUploadPart, UploadRequest } from './upload-request.js'
import { readUploadManifest } from './upload-request.js'
import { UploadFilesystemService } from '../filesystem/upload-filesystem.service.js'
import { TransferService } from '../transfers/transfer.service.js'
import { parseUploadManifest } from '../filesystem/upload-validation.js'
import { withFilesystemFailure } from '../filesystem/errors.js'

@Controller()
export class UploadsController {
  constructor(
    private readonly uploadFilesystemService: UploadFilesystemService,
    private readonly transferService: TransferService
  ) {}

  @Post('upload/:id/cancel')
  @HttpCode(HttpStatus.ACCEPTED)
  cancelUpload(@Param('id') id: string): void {
    this.transferService.cancel(id, 'upload')
  }

  @Post('upload/preflight')
  preflight(@Body() body: unknown): Promise<{ conflicts: Awaited<ReturnType<UploadFilesystemService['preflight']>> }> {
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
      throw new ApiException('invalid_request', 'The upload request is invalid.', HttpStatus.BAD_REQUEST)
    }

    const manifest = parseUploadManifest(body.manifest, body.manifest.items.length)
    return this.uploadFilesystemService.preflight(body.directory, manifest).then((conflicts) => ({ conflicts }))
  }

  @Post('upload')
  @UseGuards(UploadSlotGuard)
  @UseInterceptors(UploadInterceptor)
  async upload(@UploadedFiles() files: StoredUploadPart[] | undefined, @Req() request: UploadRequest): Promise<void> {
    const operation = request.transferUpload
    if (!operation) throw new ApiException('invalid_request', 'The upload request is invalid.', HttpStatus.BAD_REQUEST)
    const policy = request.query.policy
    if (policy !== 'rename' && policy !== 'overwrite') throw new ApiException('invalid_request', 'The upload request is invalid.', HttpStatus.BAD_REQUEST)

    await this.uploadFilesystemService.finishUpload(
      operation.id,
      operation.directory,
      operation.stagingPath,
      readUploadManifest(request),
      files ?? [],
      policy,
      operation.total,
      operation.bytesTotal,
      operation.signal
    )
    try {
      await this.uploadFilesystemService.cleanupStagingDirectory(operation.stagingPath)
    } catch (error) {
      throw withFilesystemFailure(error, 'The upload completed and its items were kept, but temporary upload data could not be removed.')
    }
    operation.signal.throwIfAborted()
    this.transferService.complete(operation.id)
    operation.cleanupListeners()
  }
}
