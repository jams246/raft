import type { ConflictPolicy, CopyConflict, UploadConflict } from '@raft/shared'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

interface TransferConflictsProps {
  kind: 'upload' | 'copy'
  conflicts?: (CopyConflict | UploadConflict)[]
  policy: ConflictPolicy
  disabled: boolean
  onPolicyChange: (policy: ConflictPolicy) => void
}

export function TransferConflicts({ kind, conflicts, policy, disabled, onPolicyChange }: TransferConflictsProps) {
  if (!conflicts || conflicts.length === 0) return null
  const groupId = `${kind}-conflict-policy`
  const conflictTitle = `${conflicts.length} naming conflict${conflicts.length === 1 ? '' : 's'}`

  return (
    <>
      <p>{conflictTitle}</p>
      <ul className="m-0 max-h-56 list-disc overflow-auto pl-5 text-sm">
        {conflicts.map((conflict) => (
          <li key={'source' in conflict ? conflict.source : conflict.name}>
            <span>{'existingName' in conflict ? conflict.existingName : conflict.name}</span> → <span>{conflict.suggestedName}</span>
          </li>
        ))}
      </ul>
      <fieldset className="grid gap-2" disabled={disabled}>
        <legend className="mb-2 text-sm font-medium">Choose how to resolve all conflicts</legend>
        <RadioGroup
          className="grid gap-2"
          onValueChange={(value) => {
            if (value === 'rename' || value === 'overwrite') onPolicyChange(value)
          }}
          value={policy}
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem id={`${groupId}-rename`} value="rename" />
            <Label htmlFor={`${groupId}-rename`}>Rename incoming items</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem id={`${groupId}-overwrite`} value="overwrite" />
            <Label htmlFor={`${groupId}-overwrite`}>Overwrite existing items</Label>
          </div>
        </RadioGroup>
      </fieldset>
    </>
  )
}
