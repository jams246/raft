import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { join } from 'node:path'
import { AppModule } from './app.module.js'
import { ApiFailureFilter } from './shared/api-failure.filter.js'

const DEFAULT_PORT = 3000

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  app.setGlobalPrefix('api')
  app.useGlobalFilters(new ApiFailureFilter())
  app.enableShutdownHooks()

  if (process.env.NODE_ENV === 'production') {
    const exportDirectory = join(import.meta.dirname, '../../frontend/out/site')
    app.useStaticAssets(exportDirectory)
  }

  const port = Number(process.env.PORT ?? DEFAULT_PORT)
  await app.listen(port, '0.0.0.0')
}

void bootstrap()
