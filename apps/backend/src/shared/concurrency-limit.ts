interface Waiter {
  signal: AbortSignal
  resolve: () => void
  reject: (reason: unknown) => void
}

/** Runs at most `limit` tasks at a time; later tasks wait in arrival order. */
export class ConcurrencyLimit {
  private active = 0
  private readonly waiting: Array<Waiter | undefined> = []
  private nextWaiter = 0

  constructor(private readonly limit: number) {}

  /**
   * Runs `task` once a slot is free.
   *
   * Waiters register no abort listener: Node's `addEventListener` is linear in the listener count, so one per queued task
   * would make a long queue quadratic. An aborted waiter is rejected when the next slot frees instead, which is prompt
   * because the running tasks observe the same signal and finish early.
   *
   * @throws The signal's reason when it aborts before the task starts; a started task handles the signal itself.
   */
  async run<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
    await this.acquire(signal)
    try {
      return await task()
    } finally {
      this.release()
    }
  }

  private acquire(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    if (this.active < this.limit) {
      this.active += 1
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      this.waiting.push({ signal, resolve, reject })
    })
  }

  private release(): void {
    this.active -= 1
    while (this.nextWaiter < this.waiting.length) {
      const waiter = this.waiting[this.nextWaiter]
      this.waiting[this.nextWaiter] = undefined
      this.nextWaiter += 1
      if (waiter === undefined) continue
      if (waiter.signal.aborted) {
        waiter.reject(waiter.signal.reason)
        continue
      }
      this.active += 1
      waiter.resolve()
      break
    }
    // Reading from an index keeps each dequeue constant time; dequeued slots are cleared and the array resets once drained.
    if (this.nextWaiter === this.waiting.length) {
      this.waiting.length = 0
      this.nextWaiter = 0
    }
  }
}
