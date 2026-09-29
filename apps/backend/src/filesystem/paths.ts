import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { ApiException } from '../api/api-exception.js'
import { HttpStatus } from '@nestjs/common'
import { toFilesystemException } from './errors.js'

export const DATA_ROOT = '/data'

export interface ValidatedPath {
  virtualPath: string
  absolutePath: string
  isDirectory: boolean
}

export function validateVirtualPath(virtualPath: string): string[] {
  if (typeof virtualPath !== 'string' || !virtualPath.startsWith('/') || virtualPath.includes('\0')) {
    throw new ApiException('invalid_path', 'The requested path is invalid.', HttpStatus.BAD_REQUEST)
  }

  if (virtualPath === '/') return []

  const components = virtualPath.slice(1).split('/')
  if (components.some((component) => component === '' || component === '.' || component === '..')) {
    throw new ApiException('invalid_path', 'The requested path is invalid.', HttpStatus.BAD_REQUEST)
  }

  return components
}

export async function resolveVirtualPath(virtualPath: string): Promise<ValidatedPath> {
  const components = validateVirtualPath(virtualPath)
  let absolutePath = DATA_ROOT
  let currentStat = await inspectComponent(DATA_ROOT)

  if (!currentStat.isDirectory()) {
    throw new ApiException('unsupported', 'The requested path is unsupported.', HttpStatus.BAD_REQUEST)
  }

  for (const component of components) {
    if (!currentStat.isDirectory()) {
      throw new ApiException('invalid_path', 'The requested path is invalid.', HttpStatus.BAD_REQUEST)
    }

    absolutePath = join(absolutePath, component)
    currentStat = await inspectComponent(absolutePath)
    if (currentStat.isSymbolicLink() || (!currentStat.isDirectory() && !currentStat.isFile())) {
      throw new ApiException('unsupported', 'The requested path is unsupported.', HttpStatus.BAD_REQUEST)
    }
  }

  return { virtualPath, absolutePath, isDirectory: currentStat.isDirectory() }
}

async function inspectComponent(absolutePath: string) {
  try {
    const metadata = await lstat(absolutePath)
    if (metadata.isSymbolicLink()) {
      throw new ApiException('unsupported', 'The requested path is unsupported.', HttpStatus.BAD_REQUEST)
    }
    return metadata
  } catch (error) {
    throw toFilesystemException(error)
  }
}
