import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Failure, toFailure } from '../../shared/failures.js'
import { toPresentationFailure } from '../../shared/api-failure.filter.js'
import { UploadManagement } from '../Application/upload-management.js'
import type { UploadRequest } from './upload-request.js'

@Injectable()
export class UploadSlotGuard implements CanActivate {
  constructor(private readonly uploads: UploadManagement) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<UploadRequest>()
    let wasAborted = request.destroyed
    this.uploads.assertIdle()

    const { directory, total, bytesTotal } = validateUploadRequest(request)

    await this.uploads.validateDestination(directory)
    if (wasAborted || request.destroyed) throw new Failure('operation_failed', 'The upload request was interrupted.')
    const session = this.uploads.reserve(directory, total, bytesTotal)
    let cleanupListeners: (() => void) | undefined
    try {
      const prepared = await this.uploads.prepare(session.id)
      const listeners = initializeUploadRequest(request, prepared, () => {
        wasAborted = true
      })
      cleanupListeners = listeners.cleanupListeners
      request.once('aborted', listeners.onRequestAborted)
      prepared.signal.addEventListener('abort', listeners.onUploadAborted, { once: true })
      prepared.signal.throwIfAborted()
      if (wasAborted || request.destroyed) throw new Failure('operation_failed', 'The upload request was interrupted.')
      return true
    } catch (error) {
      cleanupListeners?.()
      const primaryFailure = session.signal.aborted ? session.signal.reason : error
      throw await this.uploads.fail(session.id, toPresentationFailure(primaryFailure) ?? toFailure(primaryFailure))
    }
  }
}

function validateUploadRequest(request: UploadRequest) {
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
    throw new Failure('invalid_request', 'The upload request is invalid.')
  }

  return { directory, total, bytesTotal }
}

function initializeUploadRequest(request: UploadRequest, prepared: Awaited<ReturnType<UploadManagement['prepare']>>, markAborted: () => void) {
  const onRequestAborted = () => {
    markAborted()
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
    sessionId: prepared.id,
    failureNotification,
    notifyFailure,
    cleanupListeners: () => {
      request.off('aborted', onRequestAborted)
      prepared.signal.removeEventListener('abort', onUploadAborted)
    },
    pendingWrites: new Set(),
    cleanupFailures: [],
    activeStreams: new Set()
  }
  return { cleanupListeners: request.transferUpload.cleanupListeners, onRequestAborted, onUploadAborted }
}
