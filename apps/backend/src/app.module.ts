import { Module } from '@nestjs/common'
import { HealthController } from './api/health.controller.js'
import { HealthService } from './api/health.service.js'
import { FilesystemService } from './filesystem/filesystem.service.js'

@Module({
  controllers: [HealthController],
  providers: [FilesystemService, HealthService]
})
export class AppModule {}
