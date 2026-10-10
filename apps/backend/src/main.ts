import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import type { Server } from 'node:http'
import { join } from 'node:path'
import { AppModule } from './app.module.js'
import { MAX_UPLOAD_MANIFEST_BYTES } from './FileManagement/Domain/upload-policy.js'
import { ApiFailureFilter } from './shared/api-failure.filter.js'
import { parsePort } from './shared/environment.js'

async function bootstrap(): Promise<void> {
  // Configuration is validated before Nest starts so a bad PORT fails without opening resources.
  const port = parsePort(process.env.PORT)
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  // Upload preflight posts the whole manifest as JSON, which outgrows the 100 KB default for large folders.
  app.useBodyParser('json', { limit: MAX_UPLOAD_MANIFEST_BYTES })
  // An upload body arrives for as long as the transfer takes, so Node's 300s whole-request limit would cut off large
  // uploads on slower links. headersTimeout still bounds clients that stall before sending headers.
  const server: Server = app.getHttpServer()
  server.requestTimeout = 0
  app.setGlobalPrefix('api')
  app.useGlobalFilters(new ApiFailureFilter())
  app.enableShutdownHooks()

  if (process.env.NODE_ENV === 'production') {
    const exportDirectory = join(import.meta.dirname, '../../frontend/out/site')
    app.useStaticAssets(exportDirectory)
  }

  await app.listen(port, '0.0.0.0')
}

try {
  await bootstrap()
} catch (error: unknown) {
  new Logger('Bootstrap').error('The server failed to start.', error instanceof Error ? error.stack : String(error))
  process.exitCode = 1
}
