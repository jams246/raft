import { Module } from '@nestjs/common'
import { config } from './config.js'
import { FileManagementModule } from './FileManagement/FileManagement.module.js'
import { TransferCoordinationModule } from './TransferCoordination/TransferCoordination.module.js'

@Module({ imports: [FileManagementModule.register(TransferCoordinationModule, { minFreeSpace: config.minFreeSpace }), TransferCoordinationModule] })
// Nest requires a decorated module class for runtime metadata.
// oxlint-disable-next-line typescript/no-extraneous-class
export class AppModule {}
