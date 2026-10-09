import { NextRequest, NextResponse } from 'next/server';
import { refreshAccessTokenOnce } from '@/lib/refresh';

export const runtime = 'nodejs';

function safeReturnPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith('/api/auth/refresh')
  ) {
    return '/';
  }
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
    const tokens = await refreshAccessTokenOnce(refreshToken);
    if (!tokens.accessToken) {
      const response = NextResponse.redirect(
        new URL('/login?expired=1', req.url),
        303,
      );
      clearSession(response);
      return response;
    }

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
    response.cookies.set('qc_refreshed', '1', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 15,
    });
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
