import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common'
import { ApiException } from './api-exception.js'
import type { UploadRequest } from './upload-request.js'
import { UploadFilesystemService } from '../filesystem/upload-filesystem.service.js'
import { toFilesystemException, withFilesystemFailure } from '../filesystem/errors.js'
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
      typeof bytesTotalValue !== 'string' ||
      bytesTotalValue.trim() === '' ||
      !Number.isSafeInteger(bytesTotal) ||
      bytesTotal < 0 ||
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
    const operation = this.transferService.reserveUpload(total, bytesTotal)
    const signal = this.transferService.getSignal(operation.id)
    let cleanupListeners: () => void = () => {}
    let stagingPath: string | undefined
    try {
      stagingPath = await this.uploadFilesystemService.prepareUpload(directory, operation.id, bytesTotal)
      const onRequestAborted = () => {
        wasAborted = true
        for (const stream of request.transferUpload?.activeStreams ?? []) {
          if (!stream.destroyed) stream.destroy(new Error('The upload request was interrupted.'))
        }
      }
      const onUploadAborted = () => {
        if (!request.complete) request.destroy()
      }
      let notifyFailure!: (error: unknown) => void
      const failureNotification = new Promise<unknown>((resolve) => {
        notifyFailure = resolve
      })
      request.transferUpload = {
        id: operation.id,
        directory,
        stagingPath,
        total,
        bytesTotal,
        signal,
        failureNotification,
        notifyFailure,
        cleanupListeners: () => {
          request.off('aborted', onRequestAborted)
          signal.removeEventListener('abort', onUploadAborted)
        },
        pendingWrites: new Set(),
        cleanupFailures: [],
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
      const primaryFailure = signal.aborted ? signal.reason : error
      let failure = toFilesystemException(primaryFailure)
      if (stagingPath) {
        try {
          await this.uploadFilesystemService.cleanupStagingDirectory(stagingPath)
        } catch (cleanupError) {
          failure = withFilesystemFailure(primaryFailure, 'Temporary upload data could not be removed.', cleanupError)
        }
      }
      this.transferService.fail(operation.id, failure.message, failure.apiErrorCode)
      throw failure
    }
  }
}
