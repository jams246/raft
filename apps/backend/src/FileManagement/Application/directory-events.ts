import { Failure } from '../../shared/failures.js'
import type { ResolvedPath } from '../Domain/models.js'
import type { DirectoryWatchingPort, OperationEvent, TransferCoordinationPort } from './ports.js'
import type { FileManagement } from './file-management.js'

export class DirectoryEvents {
  constructor(
    private readonly files: FileManagement,
    private readonly watching: DirectoryWatchingPort,
    private readonly transfers: TransferCoordinationPort
  ) {}

  async validateDirectories(paths: string[]): Promise<ResolvedPath[]> {
    const distinctPaths = [...new Set(paths)]
    if (distinctPaths.length > 2) throw new Failure('invalid_request', 'Subscribe to at most two directories.')
    return Promise.all(distinctPaths.map((path) => this.files.validateDirectory(path)))
  }

  subscribe(directories: ResolvedPath[], listener: (event: OperationEvent) => void, onError: (error: unknown) => void): () => void {
    const cleanups: Array<() => void> = [this.transfers.subscribe(listener)]
    try {
      for (const directory of directories) {
        cleanups.push(
          this.watching.subscribe(
            directory.absolutePath,
            () => listener({ type: 'directory_changed', path: directory.virtualPath }),
            () => onError(new Failure('operation_failed', 'Directory watch failed.'))
          )
        )
      }
    } catch (error) {
      for (const cleanup of cleanups) cleanup()
      throw error
    }
    listener({ type: 'operation_state', operation: this.transfers.getSnapshot() })
    return () => {
      for (const cleanup of cleanups.reverse()) cleanup()
    }
  }
}
