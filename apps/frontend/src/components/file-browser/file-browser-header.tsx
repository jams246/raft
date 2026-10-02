import Image from 'next/image'
import type { TransferWorkflowState } from './use-transfer-destination'

interface FileBrowserHeaderProps {
  isDualPane: boolean
  transferWorkflow?: TransferWorkflowState
  onReturnToMyFiles: () => void
  onToggleDualPane: () => void
}

export function FileBrowserHeader({ isDualPane, transferWorkflow, onReturnToMyFiles, onToggleDualPane }: FileBrowserHeaderProps) {
  return (
    <header className="file-browser__header">
      <div>
        <h1 className="file-browser__title">
          <button
            className="file-browser__title-link"
            aria-label="RAFT, return to My files"
            disabled={Boolean(transferWorkflow)}
            onClick={onReturnToMyFiles}
            type="button"
          >
            <Image src="/icon.png" alt="" width={32} height={32} unoptimized />
            RAFT
          </button>
          <span className="file-browser__subtitle">
            <span className="file-browser__initial">R</span>emote <span className="file-browser__initial">A</span>ccess{' '}
            <span className="file-browser__initial">F</span>ile <span className="file-browser__initial">T</span>ool
          </span>
        </h1>
        {transferWorkflow?.destinationPane ? (
          <p className="copy-workflow__summary">
            {transferWorkflow.kind === 'move' ? 'Moving' : 'Copying'} {transferWorkflow.sourcePaths.length}{' '}
            {transferWorkflow.sourcePaths.length === 1 ? 'item' : 'items'}. Choose a destination in the right pane.
          </p>
        ) : null}
      </div>
      <button aria-pressed={isDualPane} className="file-browser__pane-toggle" disabled={Boolean(transferWorkflow)} onClick={onToggleDualPane} type="button">
        Dual Pane
      </button>
    </header>
  )
}
