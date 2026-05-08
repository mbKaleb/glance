/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // larger body limit for base64 image POSTs to /api/vision
    serverActions: { bodySizeLimit: '4mb' },
  },
};

export default nextConfig;
