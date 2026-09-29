import { Controller, Get, HttpStatus, Query } from '@nestjs/common'
import type { DirectoryListing } from '@raft/shared'
import { ApiException } from './api-exception.js'
import { FilesystemService } from '../filesystem/filesystem.service.js'

@Controller()
export class FilesController {
  constructor(private readonly filesystemService: FilesystemService) {}

  @Get('files')
  listFiles(@Query('path') virtualPath: string | string[] | undefined): Promise<DirectoryListing> {
    if (virtualPath !== '/') {
      throw new ApiException('invalid_path', 'The requested path is invalid.', HttpStatus.BAD_REQUEST)
    }

    return this.filesystemService.listRoots()
  }
}
