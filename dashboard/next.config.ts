import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Đóng gói thành server tự chạy (~150MB) để deploy được lên BẤT KỲ chỗ nào
  // chạy được container: Google Cloud Run, Render, Koyeb, VPS, hoặc máy ở văn
  // phòng. Không khoá vào Vercel.
  output: 'standalone',

  // Webhook + sync routes must never be statically optimised.
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
};

export default nextConfig;
