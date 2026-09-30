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
    this.transferService.assertIdle()

    const directory = request.query.directory
    const totalValue = request.query.total
    const bytesTotalValue = request.query.bytesTotal
    const policy = request.query.policy
    const contentType = request.headers['content-type']
    const total = typeof totalValue === 'string' ? Number(totalValue) : Number.NaN
    const bytesTotal = typeof bytesTotalValue === 'string' && bytesTotalValue.trim() !== '' ? Number(bytesTotalValue) : Number.NaN
    if (
      typeof directory !== 'string' ||
      !Number.isSafeInteger(total) ||
      total < 1 ||
      (bytesTotalValue !== undefined && (!Number.isSafeInteger(bytesTotal) || bytesTotal < 0)) ||
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
    const operation = this.transferService.reserveUpload(total, bytesTotalValue === undefined ? null : bytesTotal)
    const signal = this.transferService.getSignal(operation.id)
    let cleanupListeners: () => void = () => {}
    let stagingPath: string | undefined
    try {
      stagingPath = await this.uploadFilesystemService.prepareUpload(directory, operation.id)
      const onRequestAborted = () => {
        wasAborted = true
        for (const stream of request.transferUpload?.activeStreams ?? []) {
          if (!stream.destroyed) stream.destroy(new Error('The upload request was interrupted.'))
        }
      }
      const onUploadAborted = () => {
        if (!request.complete) request.destroy()
      }
      request.transferUpload = {
        id: operation.id,
        directory,
        stagingPath,
        total,
        bytesTotal: bytesTotalValue === undefined ? null : bytesTotal,
        signal,
        cleanupListeners: () => {
          request.off('aborted', onRequestAborted)
          signal.removeEventListener('abort', onUploadAborted)
        },
        pendingWrites: new Set(),
        activeStreams: new Set()
      }
      cleanupListeners = request.transferUpload.cleanupListeners
      request.once('aborted', onRequestAborted)
      signal.addEventListener('abort', onUploadAborted, { once: true })
      signal.throwIfAborted()
      if (wasAborted || request.aborted || request.destroyed)
        throw new ApiException('operation_failed', 'The upload request was interrupted.', HttpStatus.INTERNAL_SERVER_ERROR)
      return true
    } catch (error) {
      cleanupListeners()
      if (stagingPath) await this.uploadFilesystemService.cleanupStagingDirectory(stagingPath).catch(() => undefined)
      const failure = signal.aborted ? signal.reason : error
      this.transferService.fail(operation.id, failure instanceof ApiException ? failure.message : 'The upload failed.')
      throw failure
    }
  }
}
