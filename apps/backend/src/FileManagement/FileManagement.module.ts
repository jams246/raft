import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common'
import { TRANSFER_COORDINATOR, type TransferCoordinator } from '../contracts/transfer-coordination.js'
import { DirectoryEvents } from './Application/directory-events.js'
import { HealthQuery } from './Application/health-query.js'
import { DownloadUseCases } from './Application/downloads.js'
import { CopyMoveUseCases } from './Application/copy-move-use-cases.js'
import { FileManagement } from './Application/file-management.js'
import { UploadManagement } from './Application/upload-management.js'
import {
  CAPACITY,
  DIRECTORY_WATCHING,
  DOWNLOAD_CONTENT,
  FILE_SYSTEM,
  MUTATION_SERIALIZATION,
  TRANSFER_COORDINATION,
  UPLOAD_STAGING
} from './Application/ports.js'
import { CopyController } from './Presentation/copy.controller.js'
import { DirectoriesController } from './Presentation/directories.controller.js'
import { EventsController } from './Presentation/events.controller.js'
import { FilesController } from './Presentation/files.controller.js'
import { HealthController } from './Presentation/health.controller.js'
import { MoveController } from './Presentation/move.controller.js'
import { UploadInterceptor } from './Presentation/upload.interceptor.js'
import { UploadSlotGuard } from './Presentation/upload-slot.guard.js'
import { UploadsController } from './Presentation/uploads.controller.js'
import { CapacityAdapter } from './Infrastructure/capacity-adapter.js'
import { CopyMoveStorageAdapter } from './Infrastructure/copy-move-storage-adapter.js'
import { DirectoryWatchAdapter } from './Infrastructure/directory-watch-adapter.js'
import { DownloadArchiveAdapter } from './Infrastructure/download-archive-adapter.js'
import { FilesystemAdapter } from './Infrastructure/filesystem-adapter.js'
import { MutationQueue } from './Infrastructure/mutation-queue.js'
import { PathResolver } from './Infrastructure/path-resolver.js'
import { TransferCoordinationAdapter } from './Infrastructure/transfer-coordination-adapter.js'
import { UploadPartStorage } from './Infrastructure/upload-part-storage.js'
import { UploadStagingAdapter } from './Infrastructure/upload-staging-adapter.js'

export interface FileManagementOptions {
  /** Raw MIN_FREE_SPACE value; CapacityAdapter parses it and warns about invalid values. */
  minFreeSpace: string | undefined
}

const controllers = [FilesController, DirectoriesController, HealthController, UploadsController, EventsController, CopyController, MoveController]

function createProviders(options: FileManagementOptions): Provider[] {
  return [
    UploadSlotGuard,
    UploadInterceptor,
    { provide: PathResolver, useFactory: () => new PathResolver() },
    { provide: CAPACITY, useFactory: () => new CapacityAdapter(options.minFreeSpace) },
    {
      provide: CopyMoveStorageAdapter,
      useFactory: (capacity: CapacityAdapter) => new CopyMoveStorageAdapter(capacity),
      inject: [CAPACITY]
    },
    {
      provide: FILE_SYSTEM,
      useFactory: (paths: PathResolver, copyMove: CopyMoveStorageAdapter) => new FilesystemAdapter(paths, copyMove),
      inject: [PathResolver, CopyMoveStorageAdapter]
    },
    { provide: DIRECTORY_WATCHING, useFactory: () => new DirectoryWatchAdapter() },
    { provide: DOWNLOAD_CONTENT, useFactory: () => new DownloadArchiveAdapter() },
    {
      provide: UploadPartStorage,
      useFactory: (capacity: CapacityAdapter) => new UploadPartStorage(capacity),
      inject: [CAPACITY]
    },
    {
      provide: UPLOAD_STAGING,
      useFactory: (paths: PathResolver, capacity: CapacityAdapter, parts: UploadPartStorage) => new UploadStagingAdapter(paths, capacity, parts),
      inject: [PathResolver, CAPACITY, UploadPartStorage]
    },
    {
      provide: TRANSFER_COORDINATION,
      useFactory: (transfers: TransferCoordinator) => new TransferCoordinationAdapter(transfers),
      inject: [TRANSFER_COORDINATOR]
    },
    {
      provide: MUTATION_SERIALIZATION,
      useFactory: (transfers: TransferCoordinationAdapter) => new MutationQueue(transfers),
      inject: [TRANSFER_COORDINATION]
    },
    {
      provide: FileManagement,
      useFactory: (filesystem: FilesystemAdapter, mutations: MutationQueue) => new FileManagement(filesystem, mutations),
      inject: [FILE_SYSTEM, MUTATION_SERIALIZATION]
    },
    {
      provide: CopyMoveUseCases,
      useFactory: (filesystem: FilesystemAdapter, mutations: MutationQueue, transfers: TransferCoordinationAdapter) =>
        new CopyMoveUseCases(filesystem, mutations, transfers),
      inject: [FILE_SYSTEM, MUTATION_SERIALIZATION, TRANSFER_COORDINATION]
    },
    {
      provide: UploadManagement,
      useFactory: (staging: UploadStagingAdapter, mutations: MutationQueue, transfers: TransferCoordinationAdapter) =>
        new UploadManagement(staging, mutations, transfers),
      inject: [UPLOAD_STAGING, MUTATION_SERIALIZATION, TRANSFER_COORDINATION]
    },
    {
      provide: DownloadUseCases,
      useFactory: (filesystem: FilesystemAdapter, archive: DownloadArchiveAdapter) => new DownloadUseCases(filesystem, archive),
      inject: [FILE_SYSTEM, DOWNLOAD_CONTENT]
    },
    {
      provide: DirectoryEvents,
      useFactory: (files: FileManagement, watching: DirectoryWatchAdapter, transfers: TransferCoordinationAdapter) =>
        new DirectoryEvents(files, watching, transfers),
      inject: [FileManagement, DIRECTORY_WATCHING, TRANSFER_COORDINATION]
    },
    {
      provide: HealthQuery,
      useFactory: (capacity: CapacityAdapter) => new HealthQuery(capacity),
      inject: [CAPACITY]
    }
  ]
}

@Module({})
// Nest requires a decorated module class for runtime metadata.
// oxlint-disable-next-line typescript/no-extraneous-class
export class FileManagementModule {
  /**
   * @param transferCoordination - Module that provides and exports {@link TRANSFER_COORDINATOR}.
   */
  static register(transferCoordination: Type<unknown>, options: FileManagementOptions): DynamicModule {
    return { module: FileManagementModule, imports: [transferCoordination], controllers, providers: createProviders(options) }
  }
}
