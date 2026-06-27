import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Transpile the workspace SDK (raw TS, no build step).
  transpilePackages: ['@sentinel/sdk'],
  // Pin the workspace root (we run builds from web/); silences the multi-lockfile warning.
  turbopack: { root: path.join(process.cwd(), '..') },
};

export default nextConfig;
