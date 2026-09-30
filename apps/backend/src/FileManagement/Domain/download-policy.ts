import { Failure } from '../../shared/failures.js'
import { validateVirtualPath } from './path-policy.js'

export function assertCanDownload(path: string): void {
  if (validateVirtualPath(path).length === 0) throw new Failure('invalid_path', 'The requested path is invalid.')
}

export function assertUniqueDownloadNames(names: string[]): void {
  if (new Set(names).size !== names.length) throw new Failure('conflict', 'Selected items have duplicate names.')
}

export function assertSafeArchiveName(name: string, isDirectory: boolean): void {
  if (name.includes('\\') || /^\w+:/.test(name) || new TextEncoder().encode(name).byteLength + Number(isDirectory) > 0xffff) {
    throw new Failure('unsupported', 'Selected items contain names that cannot be safely stored in a ZIP.')
  }
}
