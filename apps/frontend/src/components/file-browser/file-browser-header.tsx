import Image from 'next/image'
import { Button } from '@/components/ui/button'
import type { TransferWorkflowState } from './use-transfer-destination'

interface FileBrowserHeaderProps {
  isDualPane: boolean
  transferWorkflow?: TransferWorkflowState | undefined
  onReturnToMyFiles: () => void
  onToggleDualPane: () => void
}

export function FileBrowserHeader({ isDualPane, transferWorkflow, onReturnToMyFiles, onToggleDualPane }: FileBrowserHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
      <div>
        <h1 className="m-0 flex items-center gap-3 text-2xl font-semibold tracking-[0.12em] text-primary">
          <Button
            aria-label="RAFT, return to My files"
            className="h-auto gap-2 p-0 text-2xl font-semibold tracking-[inherit] text-inherit hover:bg-transparent"
            disabled={Boolean(transferWorkflow)}
            onClick={onReturnToMyFiles}
            variant="ghost"
          >
            <Image src="/icon.svg" alt="" width={32} height={32} unoptimized />
            RAFT
          </Button>
          <span className="text-xs font-normal tracking-normal text-muted-foreground">
            <span className="text-primary underline decoration-1 underline-offset-2">R</span>emote{' '}
            <span className="text-primary underline decoration-1 underline-offset-2">A</span>ccess{' '}
            <span className="text-primary underline decoration-1 underline-offset-2">F</span>ile{' '}
            <span className="text-primary underline decoration-1 underline-offset-2">T</span>ool
          </span>
        </h1>
        {transferWorkflow?.destinationPane ? (
          <p className="mt-2 mb-0 text-sm text-muted-foreground">
            {transferWorkflow.kind === 'move' ? 'Moving' : 'Copying'} {transferWorkflow.sourcePaths.length}{' '}
            {transferWorkflow.sourcePaths.length === 1 ? 'item' : 'items'}. Choose a destination in the right pane.
          </p>
        ) : null}
      </div>
      <Button
        aria-pressed={isDualPane}
        className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90"
        disabled={Boolean(transferWorkflow)}
        onClick={onToggleDualPane}
        variant="outline"
      >
        Dual Pane
      </Button>
    </header>
  )
}
