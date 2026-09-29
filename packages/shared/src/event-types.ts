export interface DirectoryChangedEvent {
  type: 'directory_changed'
  path: string
}

export interface TransferStateEvent {
  type: 'transfer_state'
  state: 'idle' | 'active'
}

export type ApiEvent = DirectoryChangedEvent | TransferStateEvent
