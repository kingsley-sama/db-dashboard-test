import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Supplier invoice PDFs are rendered on the server; react-pdf must load as a
  // plain Node package rather than be bundled.
  serverExternalPackages: ['@react-pdf/renderer'],
  experimental: {
    ppr: true,
    clientSegmentCache: true
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'grukocsepesmslwfjnpk.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
