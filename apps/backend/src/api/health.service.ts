import { Injectable } from '@nestjs/common'
import type { ApiHealth } from '@raft/shared'
import { StorageCapacityService } from '../filesystem/storage-capacity.service.js'

@Injectable()
export class HealthService {
  constructor(private readonly storageCapacityService: StorageCapacityService) {}

  getStatus(): ApiHealth {
    const warnings = this.storageCapacityService.warning ? [this.storageCapacityService.warning] : undefined
    return { status: 'ok', ...(warnings ? { warnings } : {}) }
  }
}
