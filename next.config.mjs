/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  env: {
    BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;


