import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_COOKIE_MAX_AGE_SECONDS,
  API_BASE,
  REFRESH_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/config';
import { refreshAccessTokenOnce } from '@/lib/refresh';

/**
 * Catch-all proxy: /api/backend/<anything> → http://API/<anything>
 *
 * Why a route handler instead of `rewrites()`?
 *   Next.js rewrites silently strip the incoming Cookie/Authorization
 *   headers by default, which broke every POST/PUT/DELETE coming from
 *   the editors (they got 401s). A custom handler explicitly forwards
 *   the cookie so the API can authenticate the request.
 *
 * Token refresh:
 *   Access JWTs are short-lived (15m). If the upstream returns 401 and we
 *   still have a valid refresh-token cookie, we transparently mint a new
 *   access token via POST /auth/refresh, set it back on the response
 *   cookies, and retry the original request once. If refresh fails we
 *   clear both cookies and forward the 401 so the client can re-login.
 */
export const runtime = 'nodejs';

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
  // Next.js 14 dev server injects `Expect: 100-continue` on certain POSTs,
  // which undici's underlying fetch refuses ("UND_ERR_NOT_SUPPORTED: expect
  // header not supported"). Stripping it here lets the upstream fetch succeed.
  'expect',
]);

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq) === name) {
      return decodeURIComponent(part.slice(eq + 1));
    }
  }
  return undefined;
}

function buildUpstreamHeaders(req: NextRequest): Headers {
  const headers = new Headers();
  for (const [k, v] of req.headers.entries()) {
    const lower = k.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    headers.set(k, v);
  }
  // Drop the incoming Cookie — the API only accepts JWTs via Authorization,
  // and re-sending the cookie to a different origin is just noise.
  headers.delete('cookie');

  const cookieHeader = req.headers.get('cookie') ?? '';
  const access = readCookie(cookieHeader, 'qc_access');
  if (access) headers.set('Authorization', `Bearer ${access}`);
  headers.set('X-Forwarded-By', 'qc-web');
  return headers;
}

function copyResponseHeaders(upstream: Response): Headers {
  const out = new Headers();
  for (const [k, v] of upstream.headers.entries()) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    out.set(k, v);
  }
  return out;
}

async function forward(req: NextRequest, ctx: { params: { path: string[] } }) {
  const targetPath = (ctx?.params?.path ?? []).join('/');
  const url = `${API_BASE}/${targetPath}${req.nextUrl.search}`;
  const headers = buildUpstreamHeaders(req);

  const init: RequestInit = {
    method: req.method,
    headers,
    // body is null for GET/HEAD; for everything else read the raw stream
    body: ['GET', 'HEAD'].includes(req.method)
      ? undefined
      : await req.arrayBuffer(),
  };

  let upstream = await fetch(url, init);
  let respHeaders = copyResponseHeaders(upstream);

  // Auto-refresh once on 401, then retry the original request.
  const cookieHeader = req.headers.get('cookie') ?? '';
  if (upstream.status === 401) {
    const refreshToken = readCookie(cookieHeader, 'qc_refresh');
    if (refreshToken) {
      const fresh = await refreshAccessTokenOnce(refreshToken);
      if (fresh.accessToken) {
        headers.set('Authorization', `Bearer ${fresh.accessToken}`);
        upstream = await fetch(url, { ...init, headers });
        respHeaders = copyResponseHeaders(upstream);
        // Attach the new tokens to the response cookies so the browser
        // adopts them on the way back. Max-age matches /api/auth/set.
        if (fresh.accessToken) {
          respHeaders.append(
            'Set-Cookie',
            `qc_access=${encodeURIComponent(fresh.accessToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ACCESS_COOKIE_MAX_AGE_SECONDS}`,
          );
        }
        if (fresh.refreshToken) {
          respHeaders.append(
            'Set-Cookie',
            `qc_refresh=${encodeURIComponent(fresh.refreshToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${REFRESH_COOKIE_MAX_AGE_SECONDS}`,
          );
        }
      } else {
        // Refresh failed — clear both cookies so the client bounces to /login.
        respHeaders.append(
          'Set-Cookie',
          'qc_access=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
        );
        respHeaders.append(
          'Set-Cookie',
          'qc_refresh=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
        );
      }
    }
  }

  // Direct links (PDFs/images opened in a tab) cannot run the client fetch
  // wrapper. If their refresh attempt still ends in 401, turn the navigation
  // into a login redirect instead of displaying a raw JSON error document.
  if (
    upstream.status === 401 &&
    req.headers.get('sec-fetch-mode') === 'navigate'
  ) {
    const login = NextResponse.redirect(
      new URL('/login?expired=1', req.url),
      303,
    );
    login.cookies.set('qc_access', '', { path: '/', maxAge: 0 });
    login.cookies.set('qc_refresh', '', { path: '/', maxAge: 0 });
    return login;
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
export const OPTIONS = forward;
