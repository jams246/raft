import { Module } from '@nestjs/common'
import { FilesController } from './api/files.controller.js'
import { DirectoriesController } from './api/directories.controller.js'
import { HealthController } from './api/health.controller.js'
import { HealthService } from './api/health.service.js'
import { FilesystemService } from './filesystem/filesystem.service.js'
import { DownloadsService } from './downloads/downloads.service.js'
import { TransferService } from './transfers/transfer.service.js'
import { UploadsController } from './api/uploads.controller.js'
import { EventsController } from './events/events.controller.js'
import { UploadFilesystemService } from './filesystem/upload-filesystem.service.js'
import { UploadSlotGuard } from './api/upload-slot.guard.js'
import { UploadInterceptor } from './api/upload.interceptor.js'
import { CopyController } from './api/copy.controller.js'
import { CopyFilesystemService } from './filesystem/copy-filesystem.service.js'

@Module({
  controllers: [FilesController, DirectoriesController, HealthController, UploadsController, EventsController, CopyController],
  providers: [
    FilesystemService,
    DownloadsService,
    HealthService,
    TransferService,
    UploadFilesystemService,
    CopyFilesystemService,
    UploadSlotGuard,
    UploadInterceptor
  ]
})
export class AppModule {}
