import { Controller, Sse, type MessageEvent } from '@nestjs/common'
import { Observable } from 'rxjs'
import { TransferService } from '../transfers/transfer.service.js'

@Controller()
export class EventsController {
  constructor(private readonly transferService: TransferService) {}

  @Sse('events')
  events(): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const subscription = this.transferService.subscribe((event) => subscriber.next({ data: event }))
      subscriber.next({ data: { type: 'operation_state', operation: this.transferService.getSnapshot() } })
      return () => subscription.unsubscribe()
    })
  }
}
