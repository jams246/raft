import type { ReactNode } from 'react'
import type { FileEntry } from '@raft/shared'
import type { FileBrowserPaneState } from './file-browser-pane-state'

export interface FileBrowserPaneActionsProps {
  children: ReactNode
  pane: FileBrowserPaneState
  position: 'left' | 'right'
  entries: FileEntry[]
  isHidden: boolean
  isLoading: boolean
  hasError: boolean
  isOperationLocked: boolean
  isTransferDestinationAllowed: boolean
  onClearSelection: () => void
  onCopy: (sourcePaths: string[]) => void
  onMove: (sourcePaths: string[]) => void
  onUploadError: (error: string) => void
  onUploadRequestStarted: (controller: AbortController) => void
  onUploadRequestFinished: (controller: AbortController, error?: string) => void
}
