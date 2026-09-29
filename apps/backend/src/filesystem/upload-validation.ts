import { HttpStatus } from '@nestjs/common'
import type { UploadManifest, UploadManifestItem } from '@raft/shared'
import { ApiException } from '../api/api-exception.js'
import { INTERNAL_TEMPORARY_NAME } from './paths.js'

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
  const items = parsed.items.map((value): UploadManifestItem => {
    if (!isRecord(value) || typeof value.name !== 'string' || (value.type !== 'file' && value.type !== 'directory') || !Array.isArray(value.files)) {
      throw invalidUpload()
    }
    validateName(value.name)
    if (names.has(value.name)) throw new ApiException('invalid_request', 'Selected items must have unique names.', HttpStatus.BAD_REQUEST)
    names.add(value.name)
    if (value.files.length === 0 || (value.type === 'file' && value.files.length !== 1)) throw invalidUpload()

    const files = value.files.map((file) => {
      if (!isRecord(file) || !Number.isSafeInteger(file.part) || typeof file.path !== 'string') throw invalidUpload()
      if ((value.type === 'file' && file.path !== '') || (value.type === 'directory' && !isSafeRelativePath(file.path))) throw invalidUpload()
      if (parts.has(file.part as number)) throw invalidUpload()
      parts.add(file.part as number)
      return { part: file.part as number, path: file.path }
    })

    if (value.type === 'directory' && new Set(files.map((file) => file.path)).size !== files.length) throw invalidUpload()
    return { name: value.name, type: value.type, files }
  })

  if (parts.size !== (partCount ?? parts.size) || [...parts].some((part) => part < 0 || part >= parts.size)) throw invalidUpload()
  return { items }
}

export function validateName(name: string): void {
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\0') || INTERNAL_TEMPORARY_NAME.test(name)) throw invalidUpload()
}

export function isSafeRelativePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\0')) return false
  return path.split('/').every((component) => component !== '' && component !== '.' && component !== '..')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function invalidUpload(): ApiException {
  return new ApiException('invalid_request', 'The upload request is invalid.', HttpStatus.BAD_REQUEST)
}
