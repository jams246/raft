import type { CapacityPort } from './ports.js'

export interface HealthStatus {
  status: 'ok'
  warnings?: string[]
}

export class HealthQuery {
  constructor(private readonly capacity: CapacityPort) {}

  getStatus(): HealthStatus {
    const warnings = this.capacity.warning ? [this.capacity.warning] : undefined
    return { status: 'ok', ...(warnings ? { warnings } : {}) }
  }
}
