import { Failure, toFailure, withFailure } from '../../shared/failures.js'
import { assertCanUpload } from '../Domain/path-policy.js'
import { parseUploadManifest } from '../Domain/upload-policy.js'
import type {
  ConflictPolicy,
  MultipartFile,
  MutationSerializationPort,
  StoredUploadPart,
  TransferCoordinationPort,
  UploadSession,
  UploadStagingPort
} from './ports.js'

interface SessionState {
  session: UploadSession
  bytesProcessed: number
  activeBytes: Map<number, number>
  nextPartId: number
}

export class UploadManagement {
  private readonly sessions = new Map<string, SessionState>()

  constructor(
    private readonly staging: UploadStagingPort,
    private readonly mutations: MutationSerializationPort,
    private readonly transfers: TransferCoordinationPort
  ) {}

  assertIdle(): void {
    this.transfers.assertIdle()
  }

  validateDestination(virtualPath: string) {
    assertCanUpload(virtualPath)
    return this.staging.validateDestination(virtualPath)
  }

  reserve(directory: string, total: number, bytesTotal: number): UploadSession {
    assertCanUpload(directory)
    const operation = this.transfers.reserveUpload(total, bytesTotal)
    const session: UploadSession = { id: operation.id, directory, total, bytesTotal, signal: operation.signal }
    this.sessions.set(session.id, { session, bytesProcessed: 0, activeBytes: new Map(), nextPartId: 0 })
    return session
  }

  async prepare(id: string): Promise<UploadSession> {
    const state = this.getState(id)
    return this.mutations.runTransferMutation(id, async () => {
      const destination = await this.validateDestination(state.session.directory)
      const stagingPath = await this.staging.prepare(destination, id, state.session.bytesTotal)
      state.session.destination = destination
      state.session.stagingPath = stagingPath
      return this.snapshot(state.session)
    })
  }

  getSession(id: string): UploadSession {
    return this.snapshot(this.getState(id).session)
  }

  async preflight(directory: string, rawManifest: unknown) {
    const manifest = parseUploadManifest(rawManifest, getManifestLength(rawManifest))
    const destination = await this.validateDestination(directory)
    return this.staging.preflight(destination, manifest)
  }

  async storePart(id: string, file: MultipartFile, currentName: string): Promise<StoredUploadPart> {
    const state = this.getState(id)
    if (!state.session.stagingPath) throw new Failure('operation_busy', 'The upload is not ready to receive files.')
    const partId = state.nextPartId++
    state.activeBytes.set(partId, 0)
    const report = (name: string) =>
      this.transfers.progress(id, {
        phase: 'transferring',
        currentName: name,
        bytesProcessed: state.bytesProcessed + [...state.activeBytes.values()].reduce((sum, bytes) => sum + bytes, 0),
        bytesTotal: state.session.bytesTotal
      })
    report(currentName)
    try {
      const part = await this.staging.storePart(state.session.stagingPath, state.session.bytesTotal, state.session.signal, file, currentName, (bytes) => {
        state.activeBytes.set(partId, bytes)
        report(currentName)
      })
      state.activeBytes.delete(partId)
      state.bytesProcessed += part.size
      report(currentName)
      return part
    } catch (error) {
      state.activeBytes.delete(partId)
      report(currentName)
      throw error
    }
  }

  partName(id: string, rawManifest: unknown, fieldname: string, fallback: string): string {
    if (rawManifest === undefined) return fallback
    const match = /^file(\d+)$/.exec(fieldname)
    if (!match) return fallback
    const part = Number(match[1])
    if (!Number.isSafeInteger(part)) return fallback
    try {
      const manifest = parseUploadManifest(rawManifest, this.getState(id).session.total)
      return manifest.items.flatMap((item) => item.files.map((file) => [file.part, item.name] as const)).find(([index]) => index === part)?.[1] ?? fallback
    } catch {
      return fallback
    }
  }

  removePart(id: string, path: string): Promise<void> {
    const state = this.getState(id)
    if (!state.session.stagingPath) return Promise.resolve()
    return this.staging.removePart(state.session.stagingPath, path)
  }

  async finish(id: string, rawManifest: unknown, parts: StoredUploadPart[], policy: ConflictPolicy): Promise<void> {
    const state = this.getState(id)
    const { session } = state
    if (!session.destination || !session.stagingPath) throw new Failure('operation_busy', 'The upload is not ready to finish.')
    const storedBytes = parts.reduce((sum, part) => {
      if (!Number.isSafeInteger(part.size) || part.size < 0) throw invalidUpload()
      return sum + BigInt(part.size)
    }, 0n)
    if (storedBytes !== BigInt(session.bytesTotal)) {
      throw new Failure('invalid_request', 'The uploaded data does not match its declared byte total.')
    }
    this.transfers.progress(id, { phase: 'finalizing', bytesProcessed: Number(storedBytes), bytesTotal: session.bytesTotal })
    const manifest = parseUploadManifest(rawManifest, session.total, parts.length)

    await this.mutations.runTransferMutation(id, async () => {
      session.signal.throwIfAborted()
      const destination = await this.validateDestination(session.directory)
      await this.staging.finish(session.stagingPath!, destination, id, manifest, parts, policy, session.signal, (index, name) =>
        this.transfers.progress(id, { current: index + 1, currentName: name })
      )
    })
    try {
      await this.staging.cleanup(session.stagingPath)
    } catch (error) {
      throw withFailure(toFailure(error), 'The upload completed and its items were kept, but temporary upload data could not be removed.')
    }
    session.signal.throwIfAborted()
    this.transfers.complete(id)
    this.sessions.delete(id)
  }

  async fail(id: string, error: unknown, cleanupFailures: unknown[] = []): Promise<Failure> {
    const state = this.sessions.get(id)
    let failure = toFailure(error)
    for (const cleanupError of cleanupFailures) {
      failure = withFailure(failure, 'Temporary upload data could not be removed.', toFailure(cleanupError))
    }
    if (state?.session.stagingPath) {
      try {
        await this.staging.cleanup(state.session.stagingPath)
      } catch (cleanupError) {
        failure = withFailure(failure, 'Temporary upload data could not be removed.', toFailure(cleanupError))
      }
    }
    this.transfers.fail(id, failure)
    this.sessions.delete(id)
    return failure
  }

  private getState(id: string): SessionState {
    const state = this.sessions.get(id)
    if (!state) throw new Failure('operation_busy', 'The upload is no longer active.')
    return state
  }

  private snapshot(session: UploadSession): UploadSession {
    return { ...session }
  }
}

function getManifestLength(value: unknown): number {
  let parsed = value
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown
    } catch {
      return 0
    }
  }
  if (typeof parsed !== 'object' || parsed === null || !('items' in parsed) || !Array.isArray(parsed.items)) return 0
  return parsed.items.length
}

function invalidUpload(): Failure {
  return new Failure('invalid_request', 'The upload request is invalid.')
}
