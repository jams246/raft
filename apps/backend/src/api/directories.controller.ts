import { Body, Controller, HttpStatus, Post } from '@nestjs/common'
import { ApiException } from './api-exception.js'
import { FilesystemService } from '../filesystem/filesystem.service.js'

@Controller('directory')
export class DirectoriesController {
  constructor(private readonly filesystemService: FilesystemService) {}

  @Post()
  createDirectory(@Body() body: unknown): Promise<void> {
    if (
      typeof body !== 'object' ||
      body === null ||
      !('parent' in body) ||
      typeof body.parent !== 'string' ||
      !('name' in body) ||
      typeof body.name !== 'string'
    ) {
      throw new ApiException('invalid_request', 'The request is invalid.', HttpStatus.BAD_REQUEST)
    }

    return this.filesystemService.createDirectory(body.parent, body.name)
  }
}
