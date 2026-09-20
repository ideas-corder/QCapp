import { NextRequest, NextResponse } from 'next/server';

/**
 * Catch-all proxy for uploaded photos / signatures:
 *   /uploads/<anything> → http://API/uploads/<anything>
 *
 * Why a route handler instead of `rewrites()` or `<img src="http://api:3002">`?
 *   1. The Next.js dev server (and the browser) needs to load these bytes
 *      from the same origin so the <img> tag actually renders the photo
 *      (CORS / mixed-port issues otherwise).
 *   2. The API's /uploads endpoint is intentionally public-read now
 *      (filenames are UUIDs), so we don't need to forward any auth.
 *   3. We deliberately do NOT use the /api/backend/[...path] handler here
 *      because that one would attach the user JWT, which the static-files
 *      path no longer needs and which the browser never sends for <img>
 *      tags anyway.
 */
export const runtime = 'nodejs';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

async function forward(req: NextRequest, ctx: { params: { path: string[] } }) {
  const targetPath = (ctx?.params?.path ?? []).join('/');
  const url = `${API_BASE}/uploads/${targetPath}`;

  const headers = new Headers();
  for (const [k, v] of req.headers.entries()) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    headers.set(k, v);
  }
  headers.delete('cookie');
  headers.delete('authorization');

  const upstream = await fetch(url, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  const respHeaders = new Headers();
  for (const [k, v] of upstream.headers.entries()) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    respHeaders.set(k, v);
  }
  // Long browser cache — the filename embeds a UUID and the bytes are
  // immutable for the lifetime of the upload. 24h is plenty.
  respHeaders.set('Cache-Control', 'public, max-age=86400, immutable');

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

export const GET = forward;
export const HEAD = forward;
