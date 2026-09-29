import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common'
import { ApiException } from './api-exception.js'
import type { UploadRequest } from './upload-request.js'
import { UploadFilesystemService } from '../filesystem/upload-filesystem.service.js'
import { TransferService } from '../transfers/transfer.service.js'

@Injectable()
export class UploadSlotGuard implements CanActivate {
  constructor(
    private readonly transferService: TransferService,
    private readonly uploadFilesystemService: UploadFilesystemService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<UploadRequest>()
    let wasAborted = request.aborted
    request.once('aborted', () => {
      wasAborted = true
      for (const stream of request.transferUpload?.activeStreams ?? []) {
        if (!stream.destroyed) stream.destroy(new Error('The upload request was interrupted.'))
      }
    })
    this.transferService.assertIdle()

    const directory = request.query.directory
    const totalValue = request.query.total
    const policy = request.query.policy
    const contentType = request.headers['content-type']
    const total = typeof totalValue === 'string' ? Number(totalValue) : Number.NaN
    if (
      typeof directory !== 'string' ||
      !Number.isSafeInteger(total) ||
      total < 1 ||
      (policy !== 'rename' && policy !== 'overwrite') ||
      typeof contentType !== 'string' ||
      !contentType.toLowerCase().startsWith('multipart/form-data;')
    ) {
      throw new ApiException('invalid_request', 'The upload request is invalid.', HttpStatus.BAD_REQUEST)
    }

    await this.uploadFilesystemService.validateDestination(directory)
    if (wasAborted || request.aborted || request.destroyed) {
      throw new ApiException('operation_failed', 'The upload request was interrupted.', HttpStatus.INTERNAL_SERVER_ERROR)
    }
    const operation = this.transferService.reserveUpload(total)
    const signal = this.transferService.getSignal(operation.id)
    signal.addEventListener(
      'abort',
      () => {
        if (!request.complete) request.destroy()
      },
      { once: true }
    )
    let stagingPath: string | undefined
    try {
      stagingPath = await this.uploadFilesystemService.prepareUpload(directory, operation.id)
      request.transferUpload = {
        id: operation.id,
        directory,
        stagingPath,
        total,
        signal,
        pendingWrites: new Set(),
        activeStreams: new Set()
      }
      signal.throwIfAborted()
      if (wasAborted || request.aborted || request.destroyed)
        throw new ApiException('operation_failed', 'The upload request was interrupted.', HttpStatus.INTERNAL_SERVER_ERROR)
      return true
    } catch (error) {
      if (stagingPath) await this.uploadFilesystemService.cleanupStagingDirectory(stagingPath).catch(() => undefined)
      const failure = signal.aborted ? signal.reason : error
      this.transferService.fail(operation.id, failure instanceof ApiException ? failure.message : 'The upload failed.')
      throw failure
    }
  }
}
