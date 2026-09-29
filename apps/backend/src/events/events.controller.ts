import { Controller, HttpStatus, Query, Sse, SseSignal, type MessageEvent } from '@nestjs/common'
import { EMPTY, Observable } from 'rxjs'
import { ApiException } from '../api/api-exception.js'
import { toFilesystemException } from '../filesystem/errors.js'
import { FilesystemService } from '../filesystem/filesystem.service.js'
import { DirectoryWatchService } from './directory-watch.service.js'
import { TransferService } from '../transfers/transfer.service.js'

@Controller()
export class EventsController {
  constructor(
    private readonly filesystemService: FilesystemService,
    private readonly directoryWatchService: DirectoryWatchService,
    private readonly transferService: TransferService
  ) {}

  @Sse('events')
  async events(@Query('path') watchedPaths: string | string[] | undefined, @SseSignal() signal: AbortSignal): Promise<Observable<MessageEvent>> {
    let paths: string[] = []
    if (typeof watchedPaths === 'string') paths = [watchedPaths]
    else if (Array.isArray(watchedPaths)) paths = watchedPaths
    else if (watchedPaths !== undefined) {
      throw new ApiException('invalid_path', 'The requested path is invalid.', HttpStatus.BAD_REQUEST)
    }
    if (!paths.every((path) => typeof path === 'string')) {
      throw new ApiException('invalid_path', 'The requested path is invalid.', HttpStatus.BAD_REQUEST)
    }

    const distinctPaths = [...new Set(paths)]
    if (distinctPaths.length > 2) {
      throw new ApiException('invalid_request', 'Subscribe to at most two directories.', HttpStatus.BAD_REQUEST)
    }

    const directories = await Promise.all(distinctPaths.map((path) => this.filesystemService.validateDirectory(path)))
    if (signal.aborted) return EMPTY

    return new Observable((subscriber) => {
      if (signal.aborted) return subscriber.complete()
      subscriber.add(this.transferService.subscribe((event) => subscriber.next({ data: event })))
      try {
        for (const directory of directories) {
          subscriber.add(
            this.directoryWatchService.subscribe(
              directory.absolutePath,
              () => subscriber.next({ data: { type: 'directory_changed', path: directory.virtualPath } }),
              () => subscriber.error(new Error('Directory watch failed.'))
            )
          )
        }
      } catch (error) {
        subscriber.error(toFilesystemException(error))
        return
      }

      subscriber.next({ data: { type: 'operation_state', operation: this.transferService.getSnapshot() } })
    })
  }
}
