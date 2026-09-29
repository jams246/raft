import { Injectable } from '@nestjs/common'
import { resolveVirtualPath } from './paths.js'
import type { ValidatedPath } from './paths.js'

@Injectable()
export class FilesystemService {
  validateExistingPath(virtualPath: string): Promise<ValidatedPath> {
    return resolveVirtualPath(virtualPath)
  }
}
