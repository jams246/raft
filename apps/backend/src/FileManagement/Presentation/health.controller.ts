import { Controller, Get } from '@nestjs/common'
import type { ApiHealth } from '@raft/shared'
import { HealthQuery } from '../Application/health-query.js'

@Controller()
export class HealthController {
  constructor(private readonly health: HealthQuery) {}

  @Get('health')
  getHealth(): ApiHealth {
    const status = this.health.getStatus()
    return { status: status.status, ...(status.warnings ? { warnings: [...status.warnings] } : {}) }
  }
}
