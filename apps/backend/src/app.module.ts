import { Module } from '@nestjs/common'
import { FilesController } from './api/files.controller.js'
import { DirectoriesController } from './api/directories.controller.js'
import { HealthController } from './api/health.controller.js'
import { HealthService } from './api/health.service.js'
import { FilesystemService } from './filesystem/filesystem.service.js'

@Module({
  controllers: [FilesController, DirectoriesController, HealthController],
  providers: [FilesystemService, HealthService]
})
export class AppModule {}
