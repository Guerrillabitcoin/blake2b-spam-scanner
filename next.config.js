/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  transpilePackages: ['@bitfiles/bpub'],
  experimental: {
    esmExternals: 'loose',
  },
};

module.exports = nextConfig;
