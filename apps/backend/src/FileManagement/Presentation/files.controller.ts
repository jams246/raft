import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common'
import type { DirectoryListing } from '@raft/shared'
import type { Response } from 'express'
import { Failure, toFailure } from '../../shared/failures.js'
import { toApiFailureResponse, toPresentationFailure } from '../../shared/api-failure.filter.js'
import { FileManagement } from '../Application/file-management.js'
import { DownloadUseCases } from '../Application/downloads.js'

@Controller()
export class FilesController {
  constructor(
    private readonly files: FileManagement,
    private readonly downloads: DownloadUseCases
  ) {}

  @Get('files')
  async listFiles(@Query('path') virtualPath: string | string[] | undefined): Promise<DirectoryListing> {
    if (typeof virtualPath !== 'string') throw new Failure('invalid_path', 'The requested path is invalid.')
    const listing = await this.files.listDirectory(virtualPath)
    return {
      path: listing.path,
      entries: listing.entries.map((entry) => ({
        name: entry.name,
        path: entry.path,
        type: entry.type,
        ...(entry.size === undefined ? {} : { size: entry.size }),
        ...(entry.protectedRoot === undefined ? {} : { protectedRoot: entry.protectedRoot })
      }))
    }
  }

  @Get('download')
  async downloadFile(@Query('path') virtualPath: string | string[] | undefined, @Res() response: Response): Promise<void> {
    const virtualPaths = typeof virtualPath === 'string' ? [virtualPath] : virtualPath
    if (!virtualPaths || virtualPaths.length === 0 || !virtualPaths.every((path) => typeof path === 'string')) {
      throw new Failure('invalid_path', 'The requested path is invalid.')
    }

    const plan = await this.downloads.prepare(virtualPaths)
    if (plan.type === 'file') {
      const { fileName, stream } = await this.files.openFileForDownload(plan.virtualPath)
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
        const failure = toPresentationFailure(error) ?? toFailure(error)
        const mapped = toApiFailureResponse(failure)
        response.status(mapped.status).json(mapped.body)
      })
      stream.pipe(response)
      return
    }

    if (response.destroyed) return
    const archive = this.downloads.createArchive(plan)
    const stop = () => archive.stop()
    let failed = false
    const fail = (error: unknown) => {
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
      const failure = toPresentationFailure(error) ?? toFailure(error)
      const mapped = toApiFailureResponse(failure)
      response.status(mapped.status).json(mapped.body)
    }

    archive.stream.on('error', fail)
    response.once('close', stop)
    response.attachment(plan.fileName).type('application/zip')
    archive.stream.pipe(response)
    void archive.start().catch(fail)
  }

  @Post('rename')
  renamePath(@Body() body: unknown): Promise<void> {
    if (typeof body !== 'object' || body === null || !('path' in body) || typeof body.path !== 'string' || !('name' in body) || typeof body.name !== 'string') {
      throw new Failure('invalid_request', 'The request is invalid.')
    }
    return this.files.renamePath(body.path, body.name)
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
      throw new Failure('invalid_request', 'The request is invalid.')
    }
    return this.files.deletePaths(body.paths)
  }
}
