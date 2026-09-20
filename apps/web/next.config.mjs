/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
  },
  // Note: the actual API and uploads proxies are route handlers under
  //   apps/web/src/app/api/backend/[...path]/route.ts
  //   apps/web/src/app/uploads/[...path]/route.ts
  // They need to forward cookies / set Cache-Control properly, which
  // `rewrites()` cannot do in Next.js 14, so we keep the proxying in
  // code rather than config.

};

export default nextConfig;
