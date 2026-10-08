import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const API_BASE =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3002';

function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function clearSession(response: NextResponse) {
  response.cookies.set('qc_access', '', { path: '/', maxAge: 0 });
  response.cookies.set('qc_refresh', '', { path: '/', maxAge: 0 });
}

export async function GET(req: NextRequest) {
  const returnTo = safeReturnPath(req.nextUrl.searchParams.get('returnTo'));
  const refreshToken = req.cookies.get('qc_refresh')?.value;

  if (!refreshToken) {
    const response = NextResponse.redirect(
      new URL('/login?expired=1', req.url),
      303,
    );
    clearSession(response);
    return response;
  }

  try {
    const upstream = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });

    if (!upstream.ok) {
      const response = NextResponse.redirect(
        new URL('/login?expired=1', req.url),
        303,
      );
      clearSession(response);
      return response;
    }

    const tokens = (await upstream.json()) as {
      accessToken?: string;
      refreshToken?: string;
    };
    if (!tokens.accessToken) throw new Error('Refresh response has no access token');

    const response = NextResponse.redirect(new URL(returnTo, req.url), 303);
    const cookieOptions = {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    };
    response.cookies.set('qc_access', tokens.accessToken, cookieOptions);
    if (tokens.refreshToken) {
      response.cookies.set('qc_refresh', tokens.refreshToken, cookieOptions);
    }
    return response;
  } catch {
    const response = NextResponse.redirect(
      new URL('/login?expired=1', req.url),
      303,
    );
    clearSession(response);
    return response;
  }
}
