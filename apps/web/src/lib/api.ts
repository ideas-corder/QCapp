// Server-only API utilities. Must NOT be imported from client components.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3002';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`API ${status}: ${body}`);
    this.name = 'ApiError';
  }
}

/**
 * Make an authenticated API request during Server Component rendering.
 *
 * Route Handlers can update cookies, but Server Components cannot. When the
 * access token is rejected, redirect through /api/auth/refresh; that handler
 * refreshes both HttpOnly cookies and sends the browser back to `returnTo`.
 */
export async function serverApiRequest(
  path: string,
  init: RequestInit = {},
  returnTo = '/',
): Promise<Response> {
  const cookieStore = cookies();
  const token = cookieStore.get('qc_access')?.value;
  if (!token) {
    const safeReturnTo = returnTo.startsWith('/') ? returnTo : '/';
    if (cookieStore.get('qc_refresh')?.value) {
      redirect(`/api/auth/refresh?returnTo=${encodeURIComponent(safeReturnTo)}`);
    }
    redirect('/login?expired=1');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (res.status === 401) {
    const safeReturnTo = returnTo.startsWith('/') ? returnTo : '/';
    redirect(`/api/auth/refresh?returnTo=${encodeURIComponent(safeReturnTo)}`);
  }

  return res;
}

export async function apiFetch<T = any>(
  path: string,
  init: RequestInit = {},
  returnTo = '/',
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await serverApiRequest(path, { ...init, headers }, returnTo);
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body);
  }
  if (res.headers.get('content-type')?.includes('application/json')) {
    return res.json();
  }
  return undefined as unknown as T;
}

export async function apiFetchOptional<T = any>(
  path: string,
  init: RequestInit = {},
  returnTo = '/',
): Promise<T | null> {
  try {
    return await apiFetch<T>(path, init, returnTo);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return null;
  }
}

export { apiLogin, apiLoginMfa } from './api-client';
