import type { ApiHealth, CopyConflict, DirectoryListing, FileEntry, FileEntryType, UploadConflict } from '@raft/shared'
import { decodeArray, isMemberOf, isNonNegativeNumber, isRecord } from './validation'

// Each decoder returns only the fields of its endpoint contract and returns undefined for any payload that does not match.

const isFileEntryType = isMemberOf<FileEntryType>({ file: true, directory: true, unsupported: true })

function decodeFileEntry(value: unknown): FileEntry | undefined {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.path !== 'string' || !isFileEntryType(value.type)) return undefined
  const { size, protectedRoot } = value
  if (size !== undefined && !isNonNegativeNumber(size)) return undefined
  if (protectedRoot !== undefined && typeof protectedRoot !== 'boolean') return undefined
  return {
    name: value.name,
    path: value.path,
    type: value.type,
    ...(size === undefined ? {} : { size }),
    ...(protectedRoot === undefined ? {} : { protectedRoot })
  }
}

export function decodeDirectoryListing(value: unknown): DirectoryListing | undefined {
  if (!isRecord(value) || typeof value.path !== 'string') return undefined
  const entries = decodeArray(value.entries, decodeFileEntry)
  return entries === undefined ? undefined : { path: value.path, entries }
}

function decodeCopyConflict(value: unknown): CopyConflict | undefined {
  if (!isRecord(value) || typeof value.source !== 'string' || typeof value.existingName !== 'string' || typeof value.suggestedName !== 'string') {
    return undefined
  }
  return { source: value.source, existingName: value.existingName, suggestedName: value.suggestedName }
}

function decodeUploadConflict(value: unknown): UploadConflict | undefined {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.suggestedName !== 'string') return undefined
  return { name: value.name, suggestedName: value.suggestedName }
}

export function decodeCopyConflicts(value: unknown): CopyConflict[] | undefined {
  return isRecord(value) ? decodeArray(value.conflicts, decodeCopyConflict) : undefined
}

export function decodeUploadConflicts(value: unknown): UploadConflict[] | undefined {
  return isRecord(value) ? decodeArray(value.conflicts, decodeUploadConflict) : undefined
}

export function decodeApiHealth(value: unknown): ApiHealth | undefined {
  if (!isRecord(value) || value.status !== 'ok') return undefined
  if (value.warnings === undefined) return { status: 'ok' }
  const warnings = decodeArray(value.warnings, (warning) => (typeof warning === 'string' ? warning : undefined))
  return warnings === undefined ? undefined : { status: 'ok', warnings }
}
