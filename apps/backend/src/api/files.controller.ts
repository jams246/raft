import { Body, Controller, Get, HttpStatus, Post, Query, Res } from '@nestjs/common'
import { ZipArchive } from 'archiver'
import type { DirectoryListing } from '@raft/shared'
import type { Response } from 'express'
import { ApiException } from './api-exception.js'
import { FilesystemService } from '../filesystem/filesystem.service.js'
import { toFilesystemException } from '../filesystem/errors.js'
import { DownloadsService } from '../downloads/downloads.service.js'

@Controller()
export class FilesController {
  constructor(
    private readonly filesystemService: FilesystemService,
    private readonly downloadsService: DownloadsService
  ) {}

  @Get('files')
  listFiles(@Query('path') virtualPath: string | string[] | undefined): Promise<DirectoryListing> {
    if (typeof virtualPath !== 'string') {
      throw new ApiException('invalid_path', 'The requested path is invalid.', HttpStatus.BAD_REQUEST)
    }

    return this.filesystemService.listDirectory(virtualPath)
  }

  @Get('download')
  async downloadFile(@Query('path') virtualPath: string | string[] | undefined, @Res() response: Response): Promise<void> {
    const virtualPaths = typeof virtualPath === 'string' ? [virtualPath] : virtualPath
    if (!virtualPaths || virtualPaths.length === 0 || !virtualPaths.every((path) => typeof path === 'string')) {
      throw new ApiException('invalid_path', 'The requested path is invalid.', HttpStatus.BAD_REQUEST)
    }

    const plan = await this.downloadsService.prepare(virtualPaths)
    if (plan.type === 'file') {
      const { fileName, stream } = await this.filesystemService.openFileForDownload(plan.virtualPath)
      if (response.destroyed) {
        stream.destroy()
        return
      }
      response.attachment(fileName).type('application/octet-stream')
      response.once('close', () => stream.destroy())
      stream.once('error', (error: unknown) => {
        if (response.headersSent) {
          response.destroy()
          return
        }
        response.removeHeader('Content-Disposition')
        response.removeHeader('Content-Type')
        const exception = toFilesystemException(error)
        response.status(exception.getStatus()).json(exception.getResponse())
      })
      stream.pipe(response)
      return
    }

    if (response.destroyed) return
    const archive = new ZipArchive({ forceZip64: true, store: true })
    const abortController = new AbortController()
    const stop = () => {
      abortController.abort()
      archive.abort()
      archive.destroy()
    }
    let failed = false
    const fail = (error: Error) => {
      if (failed) return
      failed = true
      stop()
      if (response.destroyed) return
      if (response.headersSent) {
        response.destroy()
        return
      }
      response.removeHeader('Content-Disposition')
      response.removeHeader('Content-Type')
      const exception = toFilesystemException(error)
      response.status(exception.getStatus()).json(exception.getResponse())
    }

    archive.on('warning', fail)
    archive.on('error', fail)
    response.once('close', stop)
    response.attachment(plan.fileName).type('application/zip')
    archive.pipe(response)
    void this.downloadsService.appendArchive(plan, archive, abortController.signal).catch(fail)
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
