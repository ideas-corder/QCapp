import { NextRequest, NextResponse } from 'next/server';

const API_BASE =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3002';

type UserRole = 'admin' | 'inspector' | 'viewer';

type CallerIdentity = {
  userId: string;
  email: string;
  role: UserRole;
  isSuperAdmin: boolean;
};

const PUBLIC_ASSET_PATHS = new Set([
  '/apple-touch-icon.png',
  '/favicon.png',
  '/logo-192.png',
  '/logo-icon.png',
  '/logo-source.png',
]);

function isPublicAsset(pathname: string): boolean {
  if (pathname === '/uploads' || pathname.startsWith('/uploads/')) return true;
  return PUBLIC_ASSET_PATHS.has(pathname);
}

function isEntryPage(pathname: string): boolean {
  return pathname === '/' || pathname === '/login';
}

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function canAccessPage(pathname: string, caller: CallerIdentity): boolean {
  if (caller.isSuperAdmin) return true;

  if (caller.role === 'inspector') {
    return matchesRoute(pathname, '/inspections');
  }

  if (caller.role === 'viewer') {
    return (
      matchesRoute(pathname, '/dashboard') ||
      matchesRoute(pathname, '/inspections') ||
      matchesRoute(pathname, '/settings')
    );
  }

  // Regular admins can use the application except for the super-admin-only
  // Users master.
  return !matchesRoute(pathname, '/users');
}

function landingPage(caller: CallerIdentity): string {
  return caller.role === 'inspector' && !caller.isSuperAdmin
    ? '/inspections'
    : '/dashboard';
}

function returnToPath(req: NextRequest): string {
  const search = new URLSearchParams(req.nextUrl.searchParams);
  // Next uses this only to distinguish React Server Component requests.
  search.delete('_rsc');
  const query = search.toString();
  return `${req.nextUrl.pathname}${query ? `?${query}` : ''}`;
}

function redirectToRefresh(req: NextRequest, returnTo: string): NextResponse {
  const url = new URL('/api/auth/refresh', req.url);
  url.searchParams.set('returnTo', returnTo);
  return NextResponse.redirect(url);
}

function redirectToLogin(req: NextRequest): NextResponse {
  const url = new URL('/login', req.url);
  url.searchParams.set('expired', '1');
  return NextResponse.redirect(url);
}

function parseCaller(value: unknown): CallerIdentity | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const role = candidate.role;
  if (role !== 'admin' && role !== 'inspector' && role !== 'viewer') {
    return null;
  }
  if (typeof candidate.userId !== 'string') return null;

  return {
    userId: candidate.userId,
    email: typeof candidate.email === 'string' ? candidate.email : '',
    role,
    isSuperAdmin: candidate.isSuperAdmin === true,
  };
}

async function getCurrentUser(
  accessToken: string,
): Promise<
  | { kind: 'authenticated'; caller: CallerIdentity }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable' }
> {
  try {
    const response = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });

    if (response.status === 401) return { kind: 'unauthorized' };
    if (!response.ok) return { kind: 'unavailable' };

    const caller = parseCaller(await response.json());
    return caller
      ? { kind: 'authenticated', caller }
      : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}

/**
 * Authenticate and authorize protected page navigations before React starts
 * rendering layouts and pages in parallel. API routes are excluded by the
 * matcher and keep using their own guards and refresh-and-retry behavior.
 */
export async function middleware(req: NextRequest) {
  const returnTo = returnToPath(req);

  if (isPublicAsset(req.nextUrl.pathname)) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-qc-return-to', returnTo);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const entryPage = isEntryPage(req.nextUrl.pathname);
  const accessToken = req.cookies.get('qc_access')?.value;
  const refreshToken = req.cookies.get('qc_refresh')?.value;

  if (!accessToken) {
    if (entryPage) {
      if (req.nextUrl.pathname === '/' && refreshToken) {
        return redirectToRefresh(req, '/');
      }
      if (req.nextUrl.pathname === '/') return redirectToLogin(req);

      const requestHeaders = new Headers(req.headers);
      requestHeaders.set('x-qc-return-to', returnTo);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    return refreshToken
      ? redirectToRefresh(req, returnTo)
      : redirectToLogin(req);
  }

  const auth = await getCurrentUser(accessToken);
  if (auth.kind === 'unauthorized') {
    if (entryPage && !refreshToken) {
      if (req.nextUrl.pathname === '/') return redirectToLogin(req);

      const requestHeaders = new Headers(req.headers);
      requestHeaders.set('x-qc-return-to', returnTo);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    return refreshToken
      ? redirectToRefresh(req, returnTo)
      : redirectToLogin(req);
  }

  // Authentication-service failures are not session expiry. Fail closed and
  // avoid repeatedly rotating tokens while the API is unavailable.
  if (auth.kind === 'unavailable') {
    return new NextResponse('Authentication service is unavailable.', {
      status: 503,
    });
  }

  if (entryPage) {
    return NextResponse.redirect(new URL(landingPage(auth.caller), req.url));
  }

  if (!canAccessPage(req.nextUrl.pathname, auth.caller)) {
    return NextResponse.redirect(new URL(landingPage(auth.caller), req.url));
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-qc-return-to', returnTo);
  // Reuse the verified identity in the protected layout instead of making a
  // second /auth/me request during the same navigation.
  requestHeaders.set(
    'x-qc-caller',
    encodeURIComponent(JSON.stringify(auth.caller)),
  );

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
