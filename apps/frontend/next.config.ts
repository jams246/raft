import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
import type { NextConfig } from 'next'

export default function nextConfig(phase: string): NextConfig {
  // In development, scripts/dev-server.mts serves the app and streams /api to the backend.
  if (phase === PHASE_DEVELOPMENT_SERVER) return {}

  return { output: 'export', distDir: 'out/site' }
}
