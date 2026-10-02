import type { ConflictPolicy, CopyConflict, UploadConflict } from '@raft/shared'

interface TransferConflictsProps {
  kind: 'upload' | 'copy'
  conflicts?: (CopyConflict | UploadConflict)[]
  policy: ConflictPolicy
  disabled: boolean
  onPolicyChange: (policy: ConflictPolicy) => void
}

export function TransferConflicts({ kind, conflicts, policy, disabled, onPolicyChange }: TransferConflictsProps) {
  if (!conflicts || conflicts.length === 0) return null
  const className = kind === 'upload' ? 'upload-dialog' : 'copy-workflow'
  const conflictTitle = `${conflicts.length} naming conflict${conflicts.length === 1 ? '' : 's'}`

  return (
    <>
      <p>{conflictTitle}</p>
      <ul className={`${className}__conflicts`}>
        {conflicts.map((conflict) => (
          <li key={'source' in conflict ? conflict.source : conflict.name}>
            <span>{'existingName' in conflict ? conflict.existingName : conflict.name}</span> → <span>{conflict.suggestedName}</span>
          </li>
        ))}
      </ul>
      <fieldset className={`${className}__policies`} disabled={disabled}>
        <legend>Choose how to resolve all conflicts</legend>
        <label>
          <input checked={policy === 'rename'} name={`${kind}-policy`} onChange={() => onPolicyChange('rename')} type="radio" value="rename" />
          Rename incoming items
        </label>
        <label>
          <input checked={policy === 'overwrite'} name={`${kind}-policy`} onChange={() => onPolicyChange('overwrite')} type="radio" value="overwrite" />
          Overwrite existing items
        </label>
      </fieldset>
    </>
  )
}
