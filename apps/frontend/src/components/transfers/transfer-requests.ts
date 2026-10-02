import type { ConflictPolicy, CopyConflict, UploadConflict } from '@raft/shared'
import { type UploadSelection, createUploadFormData } from '../uploads/file-browser-upload'

export async function startCopyTransfer(
  kind: 'copy' | 'move',
  sourcePaths: string[],
  destinationPath: string,
  conflictPolicy: ConflictPolicy,
  signal: AbortSignal
): Promise<void> {
  const response = await fetch(`/api/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ sources: sourcePaths, destination: destinationPath, conflictPolicy })
  })
  if (!response.ok) throw new Error(await getResponseMessage(response, `Unable to ${kind} selected items.`))
}

export async function checkCopyConflicts(kind: 'copy' | 'move', sourcePaths: string[], destinationPath: string, signal: AbortSignal): Promise<CopyConflict[]> {
  const response = await fetch(`/api/${kind}/preflight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources: sourcePaths, destination: destinationPath }),
    signal
  })
  if (!response.ok) throw new Error(await getResponseMessage(response, `Unable to check ${kind} conflicts.`))
  const result: { conflicts: CopyConflict[] } = await response.json()
  return result.conflicts
}

export function createUploadRequest(
  directory: string,
  selection: UploadSelection,
  policy: ConflictPolicy,
  bytesTotal: number,
  signal: AbortSignal
): Promise<Response> {
  const query = new URLSearchParams({ directory, total: String(selection.manifest.items.length), policy })
  query.set('bytesTotal', String(bytesTotal))
  return fetch(`/api/upload?${query}`, { method: 'POST', body: createUploadFormData(selection), signal })
}

export async function ensureUploadSucceeded(response: Response): Promise<void> {
  if (!response.ok) throw new Error(await getResponseMessage(response, 'Unable to upload selected items.'))
}

export async function checkUploadConflicts(directory: string, selection: UploadSelection, signal: AbortSignal): Promise<UploadConflict[]> {
  const response = await fetch('/api/upload/preflight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directory, manifest: selection.manifest }),
    signal
  })
  if (!response.ok) throw new Error(await getResponseMessage(response, 'Unable to check upload names.'))
  const result: { conflicts: UploadConflict[] } = await response.json()
  return result.conflicts
}

async function getResponseMessage(response: Response, fallback: string): Promise<string> {
  const error: { message?: string } | undefined = await response.json().catch(() => undefined)
  return error?.message ?? fallback
}
