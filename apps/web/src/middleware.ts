import { NextRequest, NextResponse } from 'next/server';

/**
 * Make the browser's requested path available to Server Components.
 * Protected layouts cannot otherwise reliably recover the current pathname,
 * but the refresh route needs it so the user returns to the same screen.
 */
export function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(
    'x-qc-return-to',
    `${req.nextUrl.pathname}${req.nextUrl.search}`,
  );

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
