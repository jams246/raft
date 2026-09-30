import { Module } from '@nestjs/common'
import { FileManagementModule } from './FileManagement/FileManagement.module.js'
import { TransferCoordinationModule } from './TransferCoordination/TransferCoordination.module.js'

@Module({ imports: [FileManagementModule, TransferCoordinationModule] })
export class AppModule {}
