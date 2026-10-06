import type { UploadSelection } from './file-browser-upload'

export interface UploadDialogProps {
  directory: string
  selection: UploadSelection
  canRetryCheck: boolean
  onDisableRetry: () => void
  isOperationLocked: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseAutoFocus: () => void
  onRequestStarted: (controller: AbortController) => void
  onRequestFinished: (controller: AbortController, error?: string) => void
}
