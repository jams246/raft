import { Module } from '@nestjs/common'
import { TRANSFER_COORDINATOR } from '../contracts/transfer-coordination.js'
import { TransferCoordination } from './Application/transfer-coordination.js'
import { TRANSFER_RUNTIME } from './Application/ports.js'
import { NodeTransferRuntime } from './Infrastructure/node-transfer-runtime.js'
import { TransfersController } from './Presentation/transfers.controller.js'

@Module({
  controllers: [TransfersController],
  providers: [
    { provide: TRANSFER_RUNTIME, useFactory: () => new NodeTransferRuntime() },
    {
      provide: TransferCoordination,
      useFactory: (runtime: NodeTransferRuntime) => new TransferCoordination(runtime),
      inject: [TRANSFER_RUNTIME]
    },
    { provide: TRANSFER_COORDINATOR, useExisting: TransferCoordination }
  ],
  exports: [TRANSFER_COORDINATOR]
})
// Nest requires a decorated module class for runtime metadata.
// oxlint-disable-next-line typescript/no-extraneous-class
export class TransferCoordinationModule {}
