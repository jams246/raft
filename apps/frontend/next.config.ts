import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
import type { NextConfig } from 'next'

export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      async rewrites() {
        return [{ source: '/api/:path*', destination: 'http://backend:3001/api/:path*' }]
      }
    }
  }

  return { output: 'export', distDir: 'out/site' }
}
