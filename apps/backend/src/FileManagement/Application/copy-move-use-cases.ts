import { basename } from 'node:path'
import { toFailure, withFailure } from '../../shared/failures.js'
import { elementAt } from '../../shared/collections.js'
import {
  assertResolvedDestination,
  assertSelectionDestination,
  assertUniqueNames,
  validateSelection,
  validateSourceAndTargetPaths
} from '../Domain/copy-move-policy.js'
import type { CopyMovePlan } from './copy-move-models.js'
import type { ConflictPolicy, FileSystemPort, MutationSerializationPort, TransferCoordinationPort } from './ports.js'

export class CopyMoveUseCases {
  constructor(
    private readonly filesystem: FileSystemPort,
    private readonly mutations: MutationSerializationPort,
    private readonly transfers: TransferCoordinationPort
  ) {}

  async preflight(sourcePaths: string[], destinationPath: string, kind: 'copy' | 'move') {
    const { sources, destination, candidates } = await this.select(sourcePaths, destinationPath, kind, true)
    const conflicts = await this.filesystem.getConflicts(destination, candidates)
    const conflictsByName = new Map(conflicts.map((conflict) => [conflict.name, conflict.suggestedName]))
    return sources.flatMap((source, index) => {
      const existingName = elementAt(candidates, index).name
      const suggestedName = conflictsByName.get(existingName)
      return suggestedName === undefined ? [] : [{ source: source.virtualPath, existingName, suggestedName }]
    })
  }

  copy(sourcePaths: string[], destinationPath: string, policy: ConflictPolicy): Promise<void> {
    return this.run('copy', sourcePaths, destinationPath, policy)
  }

  move(sourcePaths: string[], destinationPath: string, policy: ConflictPolicy): Promise<void> {
    return this.run('move', sourcePaths, destinationPath, policy)
  }

  private async run(kind: 'copy' | 'move', sourcePaths: string[], destinationPath: string, policy: ConflictPolicy): Promise<void> {
    const operation =
      kind === 'copy'
        ? this.transfers.reserveCopy(sourcePaths.length, basename(destinationPath))
        : this.transfers.reserveMove(sourcePaths.length, basename(destinationPath))

    try {
      await this.mutations.runTransferMutation(operation.id, async () => {
        operation.signal.throwIfAborted()
        const { sources, destination, candidates } = await this.select(sourcePaths, destinationPath, kind, false)
        const validateTargets = (targets: Array<{ name: string }>) =>
          validateSourceAndTargetPaths(
            sources.map((source) => source.virtualPath),
            targets.map((target) => `${destination.virtualPath}/${target.name}`),
            kind
          )
        if (kind === 'move' && policy === 'overwrite') validateTargets(candidates)
        const targets = await this.filesystem.resolveTargets(destination, candidates, policy)
        validateTargets(targets)
        const prepared = await this.filesystem.prepareSources(sources, operation.signal, (name) => this.transfers.progress(operation.id, { currentName: name }))
        const plan: CopyMovePlan = {
          items: prepared.sources.map((source, index) => ({ ...source, target: elementAt(targets, index) })),
          bytesTotal: prepared.bytesTotal
        }
        this.transfers.progress(operation.id, { phase: 'transferring', bytesTotal: plan.bytesTotal })

        await this.executePlan(kind, plan, operation.id, operation.signal)
      })
      this.transfers.complete(operation.id)
    } catch (error) {
      const failure = toFailure(error)
      this.transfers.fail(operation.id, failure)
      throw failure
    }
  }

  private async executePlan(kind: 'copy' | 'move', plan: CopyMovePlan, operationId: string, signal: AbortSignal): Promise<void> {
    let completedItems = 0
    let bytesProcessed = 0
    let bytesTotal = plan.bytesTotal
    try {
      for (const [index, item] of plan.items.entries()) {
        signal.throwIfAborted()
        this.transfers.progress(operationId, { phase: 'transferring', currentName: basename(item.source.virtualPath) })
        const result = await this.filesystem[kind === 'copy' ? 'copyItem' : 'moveItem'](
          item,
          operationId,
          index,
          signal,
          (itemBytes) => this.transfers.progress(operationId, { bytesProcessed: bytesProcessed + itemBytes }),
          () => {
            bytesTotal = null
            this.transfers.progress(operationId, { bytesTotal: null })
          },
          () => this.transfers.progress(operationId, { phase: 'transferring' }),
          () => this.transfers.progress(operationId, { phase: 'finalizing' })
        )
        if (!result.matchesPreparedSize || result.bytesTotal === null) {
          bytesTotal = null
          this.transfers.progress(operationId, { bytesTotal: null })
        }
        bytesProcessed += result.bytesWritten
        completedItems += 1
        this.transfers.progress(operationId, {
          current: completedItems,
          currentName: basename(item.source.virtualPath),
          bytesProcessed,
          bytesTotal
        })
        if (result.cleanupFailure) throw result.cleanupFailure
      }
      signal.throwIfAborted()
    } catch (error) {
      if (completedItems > 0) throw withFailure(toFailure(error), `The ${kind} stopped after ${completedItems} of ${plan.items.length} items.`)
      throw error
    }
  }

  private async select(sourcePaths: string[], destinationPath: string, kind: 'copy' | 'move', validateTree: boolean) {
    validateSelection(sourcePaths, kind)
    const sources = await Promise.all(
      sourcePaths.map((path) => (validateTree ? this.filesystem.validateExistingPath(path) : this.filesystem.resolvePath(path)))
    )
    assertSelectionDestination(sourcePaths, destinationPath, kind)
    const destination = await this.filesystem.resolvePath(destinationPath)
    assertResolvedDestination(sources, destination, kind)
    const candidates = sources.map((source) => ({
      name: basename(source.absolutePath),
      type: source.isDirectory ? ('directory' as const) : ('file' as const)
    }))
    assertUniqueNames(candidates.map((candidate) => candidate.name))
    return { sources, destination, candidates }
  }
}
