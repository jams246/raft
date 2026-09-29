import { Injectable } from '@nestjs/common'
import type { ApiHealth } from '@raft/shared'

@Injectable()
export class HealthService {
  getStatus(): ApiHealth {
    return { status: 'ok' }
  }
}
