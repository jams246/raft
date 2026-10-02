import { INTERNAL_TEMPORARY_NAME } from './path-policy.js'
import { Failure } from '../../shared/failures.js'

export interface UploadManifestItem {
  name: string
  type: 'file' | 'directory'
  files: Array<{ part: number; path: string }>
}

export interface UploadManifest {
  items: UploadManifestItem[]
}

export function parseUploadManifest(value: unknown, total: number, partCount?: number): UploadManifest {
  let parsed = value
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown
    } catch {
      throw invalidUpload()
    }
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.items) || parsed.items.length !== total || total < 1) throw invalidUpload()

  const names = new Set<string>()
  const parts = new Set<number>()
  const items = parsed.items.map((item): UploadManifestItem => {
    if (!isRecord(item) || typeof item.name !== 'string' || (item.type !== 'file' && item.type !== 'directory') || !Array.isArray(item.files)) {
      throw invalidUpload()
    }
    validateUploadName(item.name)
    if (names.has(item.name)) throw new Failure('invalid_request', 'Selected items must have unique names.')
    names.add(item.name)
    if (item.files.length === 0 || (item.type === 'file' && item.files.length !== 1)) throw invalidUpload()

    const files = item.files.map((file) => {
      if (!isRecord(file) || typeof file.part !== 'number' || !Number.isSafeInteger(file.part) || typeof file.path !== 'string') throw invalidUpload()
      if ((item.type === 'file' && file.path !== '') || (item.type === 'directory' && !isSafeRelativePath(file.path))) throw invalidUpload()
      if (parts.has(file.part)) throw invalidUpload()
      parts.add(file.part)
      return { part: file.part, path: file.path }
    })
    if (item.type === 'directory' && new Set(files.map((file) => file.path)).size !== files.length) throw invalidUpload()
    return { name: item.name, type: item.type, files }
  })

  if (parts.size !== (partCount ?? parts.size) || [...parts].some((part) => part < 0 || part >= parts.size)) throw invalidUpload()
  return { items }
}

export function validateUploadName(name: string): void {
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\0') || INTERNAL_TEMPORARY_NAME.test(name)) throw invalidUpload()
}

export function isSafeRelativePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\0')) return false
  return path.split('/').every((component) => component !== '' && component !== '.' && component !== '..')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function invalidUpload(): Failure {
  return new Failure('invalid_request', 'The upload request is invalid.')
}
