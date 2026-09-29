import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common'
import type { DirectoryListing } from '@raft/shared'
import { ApiException } from './api-exception.js'
import { FilesystemService } from '../filesystem/filesystem.service.js'

@Controller()
export class FilesController {
  constructor(private readonly filesystemService: FilesystemService) {}

  @Get('files')
  listFiles(@Query('path') virtualPath: string | string[] | undefined): Promise<DirectoryListing> {
    if (typeof virtualPath !== 'string') {
      throw new ApiException('invalid_path', 'The requested path is invalid.', HttpStatus.BAD_REQUEST)
    }

    return this.filesystemService.listDirectory(virtualPath)
  }

  @Post('rename')
  renamePath(@Body() body: unknown): Promise<void> {
    if (typeof body !== 'object' || body === null || !('path' in body) || typeof body.path !== 'string' || !('name' in body) || typeof body.name !== 'string') {
      throw new ApiException('invalid_request', 'The request is invalid.', HttpStatus.BAD_REQUEST)
    }

    return this.filesystemService.renamePath(body.path, body.name)
  }

  @Post('delete')
  deletePaths(@Body() body: unknown): Promise<void> {
    if (
      typeof body !== 'object' ||
      body === null ||
      !('paths' in body) ||
      !Array.isArray(body.paths) ||
      !body.paths.every((path: unknown) => typeof path === 'string')
    ) {
      throw new ApiException('invalid_request', 'The request is invalid.', HttpStatus.BAD_REQUEST)
    }

    return this.filesystemService.deletePaths(body.paths)
  }
}
