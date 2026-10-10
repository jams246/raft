import { Controller, type MessageEvent, Query, Sse, SseSignal } from '@nestjs/common'
import { EMPTY, Observable } from 'rxjs'
import type { TransferEvent as ApiTransferEvent, TransferState as ApiTransferState } from '@raft/shared'
import { Failure, toFailure } from '../../shared/failures.js'
import { toApiErrorCode, toPresentationFailure } from '../../shared/api-failure.filter.js'
import { DirectoryEvents } from '../Application/directory-events.js'
import type { OperationEvent, TransferSnapshot } from '../Application/ports.js'

// Proxies drop idle connections (the Next dev proxy after 30s), so the stream sends an SSE comment well inside that window.
// EventSource ignores comments, so clients never see the keep-alive.
const KEEP_ALIVE_INTERVAL_MS = 15_000

@Controller()
export class EventsController {
  constructor(private readonly directoryEvents: DirectoryEvents) {}

  @Sse('events')
  async events(@Query('path') watchedPaths: string | string[] | undefined, @SseSignal() signal: AbortSignal): Promise<Observable<MessageEvent>> {
    let paths: string[] = []
    if (typeof watchedPaths === 'string') paths = [watchedPaths]
    else if (Array.isArray(watchedPaths)) paths = watchedPaths
    else if (watchedPaths !== undefined) throw new Failure('invalid_path', 'The requested path is invalid.')
    if (!paths.every((path) => typeof path === 'string')) throw new Failure('invalid_path', 'The requested path is invalid.')

    const directories = await this.directoryEvents.validateDirectories(paths)
    if (signal.aborted) return EMPTY
    return new Observable((subscriber) => {
      if (signal.aborted) return subscriber.complete()
      let unsubscribe: (() => void) | undefined
      try {
        unsubscribe = this.directoryEvents.subscribe(
          directories,
          (event) => subscriber.next({ data: toApiEvent(event) }),
          (error) => subscriber.error(toPresentationFailure(error) ?? toFailure(error))
        )
      } catch (error) {
        subscriber.error(toPresentationFailure(error) ?? toFailure(error))
      }
      const keepAlive = setInterval(() => subscriber.next({ comment: 'keep-alive' }), KEEP_ALIVE_INTERVAL_MS)
      return () => {
        clearInterval(keepAlive)
        unsubscribe?.()
      }
    })
  }
}

function toApiEvent(event: OperationEvent): ApiTransferEvent {
  if (event.type === 'directory_changed') return { type: 'directory_changed', path: event.path }
  if (event.type === 'operation_failed') {
    return {
      type: 'operation_failed',
      operationId: event.operationId,
      error: toApiErrorCode(new Failure(event.failure.kind, event.failure.message)),
      message: event.failure.message
    }
  }
  if (event.type === 'operation_completed') return { type: 'operation_completed', operationId: event.operationId }
  if (event.type === 'operation_state') {
    return { type: event.type, operation: event.operation ? toApiState(event.operation) : null }
  }
  return { type: event.type, operation: toApiState(event.operation) }
}

function toApiState(state: TransferSnapshot): ApiTransferState {
  return {
    id: state.id,
    kind: state.kind,
    current: state.current,
    total: state.total,
    phase: state.phase,
    bytesProcessed: state.bytesProcessed,
    bytesTotal: state.bytesTotal,
    ...(state.currentName === undefined ? {} : { currentName: state.currentName }),
    ...(state.destinationName === undefined ? {} : { destinationName: state.destinationName }),
    status: state.status
  }
}
