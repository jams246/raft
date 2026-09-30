import type { MutationSerializationPort, TransferCoordinationPort } from '../Application/ports.js'

export class MutationQueue implements MutationSerializationPort {
  private queue = Promise.resolve()

  constructor(private readonly transfers: TransferCoordinationPort) {}

  assertIdle(): void {
    this.transfers.assertIdle()
  }

  runMutation<T>(action: () => Promise<T>): Promise<T> {
    this.transfers.assertIdle()
    const result = this.queue.then(() => {
      this.transfers.assertIdle()
      return action()
    })
    this.queue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  runTransferMutation<T>(operationId: string, action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(() => {
      this.transfers.assertActive(operationId)
      return action()
    })
    this.queue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}
