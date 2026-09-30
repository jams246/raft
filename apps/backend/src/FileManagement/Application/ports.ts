import type { Readable } from 'node:stream'
import type { FailureKind } from '../../shared/failures.js'
import type { DirectoryListing, ReplacementCandidate, ResolvedPath, UploadConflict } from '../Domain/models.js'
import type { CopyMoveItem, CopyMoveResult } from './copy-move-models.js'
import type { UploadManifest } from '../Domain/upload-policy.js'

export type ConflictPolicy = 'rename' | 'overwrite'
export type TransferProgress = Partial<{
  current: number
  currentName: string
  phase: 'preparing' | 'transferring' | 'finalizing'
  bytesProcessed: number
  bytesTotal: number | null
}>

export interface TransferReservation {
  id: string
  signal: AbortSignal
}

export interface TransferSnapshot {
  id: string
  kind: 'upload' | 'copy' | 'move'
  current: number
  total: number
  phase: 'preparing' | 'transferring' | 'finalizing'
  bytesProcessed: number
  bytesTotal: number | null
  currentName?: string
  destinationName?: string
  status: 'running'
}

export type OperationEvent =
  | { type: 'operation_state'; operation: TransferSnapshot | null }
  | { type: 'operation_started'; operation: TransferSnapshot }
  | { type: 'operation_progress'; operation: TransferSnapshot }
  | { type: 'operation_completed'; operationId: string }
  | { type: 'operation_failed'; operationId: string; failure: { kind: FailureKind; message: string } }
  | { type: 'directory_changed'; path: string }

export interface TransferCoordinationPort {
  getSnapshot(): TransferSnapshot | null
  subscribe(listener: (event: OperationEvent) => void): () => void
  reserveUpload(total: number, bytesTotal: number): TransferReservation
  reserveCopy(total: number, destinationName: string): TransferReservation
  reserveMove(total: number, destinationName: string): TransferReservation
  assertIdle(): void
  assertActive(id: string): void
  progress(id: string, update: TransferProgress): void
  complete(id: string): void
  fail(id: string, error: unknown): void
}

export interface MutationSerializationPort {
  assertIdle(): void
  runMutation<T>(action: () => Promise<T>): Promise<T>
  runTransferMutation<T>(operationId: string, action: () => Promise<T>): Promise<T>
}

export interface FileSystemPort {
  resolvePath(virtualPath: string): Promise<ResolvedPath>
  validateExistingPath(virtualPath: string): Promise<ResolvedPath>
  validateDirectory(virtualPath: string): Promise<ResolvedPath>
  validateSupportedTree(path: ResolvedPath): Promise<void>
  listSupportedTree(path: ResolvedPath): Promise<FileTreeEntry[]>
  assertReadable(paths: string[]): Promise<void>
  listDirectory(directory: ResolvedPath): Promise<DirectoryListing>
  createDirectory(parent: ResolvedPath, name: string): Promise<void>
  renamePath(source: ResolvedPath, name: string): Promise<void>
  deletePaths(paths: ResolvedPath[]): Promise<void>
  openFileForDownload(path: ResolvedPath): Promise<{ fileName: string; stream: Readable }>
  getConflicts(destination: ResolvedPath, candidates: ReplacementCandidate[]): Promise<UploadConflict[]>
  resolveTargets(destination: ResolvedPath, candidates: ReplacementCandidate[], policy: ConflictPolicy): Promise<Array<CopyMoveItem['target']>>
  prepareSources(
    sources: ResolvedPath[],
    signal: AbortSignal,
    onPreparing: (name: string) => void
  ): Promise<{ sources: Array<Omit<CopyMoveItem, 'target'>>; bytesTotal: number | null }>
  copyItem(
    item: CopyMoveItem,
    operationId: string,
    index: number,
    signal: AbortSignal,
    reportBytes: (bytes: number) => void,
    invalidateTotal: () => void,
    enterTransferring: () => void,
    enterFinalizing: () => void
  ): Promise<CopyMoveResult>
  moveItem(
    item: CopyMoveItem,
    operationId: string,
    index: number,
    signal: AbortSignal,
    reportBytes: (bytes: number) => void,
    invalidateTotal: () => void,
    enterTransferring: () => void,
    enterFinalizing: () => void
  ): Promise<CopyMoveResult>
}

export interface FileTreeEntry {
  absolutePath: string
  relativePath: string
  isDirectory: boolean
  size: number
  modifiedAt: Date
  mode: number
}

export interface UploadStagingPort {
  validateDestination(virtualPath: string): Promise<ResolvedPath>
  prepare(destination: ResolvedPath, operationId: string, bytesTotal: number): Promise<string>
  preflight(destination: ResolvedPath, manifest: UploadManifest): Promise<UploadConflict[]>
  storePart(
    stagingPath: string,
    bytesTotal: number,
    signal: AbortSignal,
    file: MultipartFile,
    currentName: string,
    report: (bytes: number) => void
  ): Promise<StoredUploadPart>
  removePart(stagingPath: string, path: string): Promise<void>
  finish(
    stagingPath: string,
    destination: ResolvedPath,
    operationId: string,
    manifest: UploadManifest,
    parts: StoredUploadPart[],
    policy: ConflictPolicy,
    signal: AbortSignal,
    onCompleted: (index: number, name: string) => void
  ): Promise<void>
  cleanup(stagingPath: string): Promise<void>
}

export interface DownloadContentPort {
  createArchive(plan: Extract<DownloadPlan, { type: 'archive' }>): ArchiveDownload
}

export interface ArchiveDownload {
  stream: Readable
  start(): Promise<void>
  stop(): void
}

export type DownloadPlan =
  | { type: 'file'; virtualPath: string }
  | {
      type: 'archive'
      fileName: string
      entries: Array<{ name: string; absolutePath: string; isDirectory: boolean; size: number; modifiedAt: Date; mode: number }>
    }

export interface DirectoryWatchingPort {
  subscribe(absolutePath: string, onChange: () => void, onError: () => void): () => void
}

export interface CapacityPort {
  warning?: string
  assertAvailable(destinationPath: string, requiredBytes: bigint): Promise<void>
}

export interface UploadSession {
  id: string
  directory: string
  destination?: ResolvedPath
  stagingPath?: string
  total: number
  bytesTotal: number
  signal: AbortSignal
}

export interface MultipartFile {
  fieldname: string
  originalname: string
  stream: Readable
}

export interface StoredUploadPart {
  fieldname: string
  path: string
  size: number
}

export const FILE_SYSTEM = Symbol('FILE_SYSTEM')
export const UPLOAD_STAGING = Symbol('UPLOAD_STAGING')
export const DOWNLOAD_CONTENT = Symbol('DOWNLOAD_CONTENT')
export const DIRECTORY_WATCHING = Symbol('DIRECTORY_WATCHING')
export const CAPACITY = Symbol('CAPACITY')
export const MUTATION_SERIALIZATION = Symbol('MUTATION_SERIALIZATION')
export const TRANSFER_COORDINATION = Symbol('TRANSFER_COORDINATION')
