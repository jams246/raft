import type { ConflictPolicy, CopyConflict, UploadConflict } from '@raft/shared'
import { API_REQUEST_TIMEOUT_MS, apiJson, apiRequest, jsonPost } from '@/lib/api/api-request'
import { decodeCopyConflicts, decodeUploadConflicts } from '@/lib/api/decoders'
import { type UploadSelection, createUploadFormData } from '../uploads/file-browser-upload'

/** Starts a copy or move; the request settles when the whole transfer finishes, so only the caller's signal or the cancel flow ends it. */
export function startCopyTransfer(
  kind: 'copy' | 'move',
  sourcePaths: string[],
  destinationPath: string,
  conflictPolicy: ConflictPolicy,
  signal: AbortSignal
): Promise<void> {
  return apiRequest(`/api/${kind}`, {
    ...jsonPost({ sources: sourcePaths, destination: destinationPath, conflictPolicy }),
    failureMessage: `Unable to ${kind} selected items.`,
    signal,
    timeoutMs: null
  })
}

export function checkCopyConflicts(kind: 'copy' | 'move', sourcePaths: string[], destinationPath: string, signal: AbortSignal): Promise<CopyConflict[]> {
  return apiJson(
    `/api/${kind}/preflight`,
    {
      ...jsonPost({ sources: sourcePaths, destination: destinationPath }),
      failureMessage: `Unable to check ${kind} conflicts.`,
      signal,
      timeoutMs: API_REQUEST_TIMEOUT_MS
    },
    decodeCopyConflicts
  )
}

/** Uploads a selection; the request lasts for the whole upload, so only the caller's signal or the cancel flow ends it. */
export function uploadSelection(directory: string, selection: UploadSelection, policy: ConflictPolicy, bytesTotal: number, signal: AbortSignal): Promise<void> {
  const query = new URLSearchParams({ directory, total: String(selection.manifest.items.length), policy, bytesTotal: String(bytesTotal) })
  return apiRequest(`/api/upload?${query}`, {
    method: 'POST',
    body: createUploadFormData(selection),
    failureMessage: 'Unable to upload selected items.',
    signal,
    timeoutMs: null
  })
}

export function checkUploadConflicts(directory: string, selection: UploadSelection, signal: AbortSignal): Promise<UploadConflict[]> {
  return apiJson(
    '/api/upload/preflight',
    {
      ...jsonPost({ directory, manifest: selection.manifest }),
      failureMessage: 'Unable to check upload names.',
      signal,
      timeoutMs: API_REQUEST_TIMEOUT_MS
    },
    decodeUploadConflicts
  )
}
