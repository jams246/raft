import { Injectable, HttpStatus } from '@nestjs/common'
import { ApiException } from '../api/api-exception.js'
import { resolveVirtualPath } from './paths.js'
import type { ValidatedPath } from './paths.js'

@Injectable()
export class FilesystemService {
  validateExistingPath(virtualPath: string): Promise<ValidatedPath> {
    return resolveVirtualPath(virtualPath)
  }

  async validateDirectory(virtualPath: string): Promise<ValidatedPath> {
    const validatedPath = await resolveVirtualPath(virtualPath)
    if (!validatedPath.isDirectory) {
      throw new ApiException('invalid_path', 'A directory path is required.', HttpStatus.BAD_REQUEST)
    }
    return validatedPath
  }
}
