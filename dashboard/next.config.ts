import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Webhook + sync routes must never be statically optimised.
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
};

export default nextConfig;
