import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The repository root also carries a pnpm lockfile; pin tracing to this
  // directory so Vercel and Turbopack treat the prototype as its own project.
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
}

export default nextConfig
