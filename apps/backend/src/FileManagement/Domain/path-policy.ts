import { Failure } from '../../shared/failures.js'
import type { FileEntry } from './models.js'

export const INTERNAL_TEMPORARY_NAME = /^\.__filebrowser_(?:tmp|old)_[0-9a-f-]+_\d+$/i

export function isProtectedRootDirectory(parentPath: string, type: FileEntry['type']): boolean {
  return parentPath === '/' && type === 'directory'
}

export function validateVirtualPath(virtualPath: string): string[] {
  if (typeof virtualPath !== 'string' || !virtualPath.startsWith('/') || virtualPath.includes('\0')) {
    throw new Failure('invalid_path', 'The requested path is invalid.')
  }
  if (virtualPath === '/') return []

  const components = virtualPath.slice(1).split('/')
  if (components.some((component) => component === '' || component === '.' || component === '..')) {
    throw new Failure('invalid_path', 'The requested path is invalid.')
  }
  return components
}

export function isSameOrDescendant(path: string, parentPath: string): boolean {
  return path === parentPath || path.startsWith(`${parentPath}/`)
}

export function topLevelPaths(paths: string[]): string[] {
  const distinctPaths = [...new Set(paths)]
  return distinctPaths.filter((candidate) => !distinctPaths.some((parent) => candidate !== parent && isSameOrDescendant(candidate, parent)))
}

export function assertItemName(name: string, message: string): void {
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\0')) {
    throw new Failure('invalid_request', message)
  }
}

export function assertCanCreateDirectory(parentPath: string, name: string): void {
  assertItemName(name, 'The folder name is invalid.')
  if (parentPath === '/') throw new Failure('protected_root', 'Folders cannot be created at the root.')
  validateVirtualPath(parentPath)
}

export function assertCanRename(virtualPath: string, name: string): void {
  assertItemName(name, 'The new name is invalid.')
  if (validateVirtualPath(virtualPath).length <= 1) throw new Failure('protected_root', 'Root entries cannot be renamed.')
}

export function assertCanDelete(virtualPaths: string[]): void {
  if (virtualPaths.length === 0) throw new Failure('invalid_request', 'Select at least one item to delete.')
}

export function assertCanDeletePath(virtualPath: string): void {
  if (validateVirtualPath(virtualPath).length <= 1) throw new Failure('protected_root', 'Root entries cannot be deleted.')
}

export function assertCanUpload(destinationPath: string): void {
  validateVirtualPath(destinationPath)
  if (destinationPath === '/') throw new Failure('protected_root', 'Uploads cannot target the root.')
}
