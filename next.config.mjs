/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['*']
    }
  },
  eslint: {
    // We run ESLint separately; avoid warnings in CI builds
    ignoreDuringBuilds: true,
  },
};
export default nextConfig;
