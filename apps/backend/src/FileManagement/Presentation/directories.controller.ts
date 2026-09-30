import { Body, Controller, Post } from '@nestjs/common'
import { Failure } from '../../shared/failures.js'
import { FileManagement } from '../Application/file-management.js'

@Controller('directory')
export class DirectoriesController {
  constructor(private readonly files: FileManagement) {}

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
      throw new Failure('invalid_request', 'The request is invalid.')
    }
    return this.files.createDirectory(body.parent, body.name)
  }
}
