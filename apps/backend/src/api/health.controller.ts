import { Controller, Get } from '@nestjs/common'
import type { ApiHealth } from '@raft/shared'
import { HealthService } from './health.service.js'

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  getHealth(): ApiHealth {
    return this.healthService.getStatus()
  }
}
