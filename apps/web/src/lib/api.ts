// Server-only API utilities. Must NOT be imported from client components.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_BASE } from '@/lib/config';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`API ${status}: ${body}`);
    this.name = 'ApiError';
  }
}

function safeReturnTo(value: string): string {
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith('/api/auth/refresh')
  ) {
    return '/';
  }
  return value;
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
  const justRefreshed = !!cookieStore.get('qc_refreshed')?.value;
  if (!token) {
    const destination = safeReturnTo(returnTo);
    if (cookieStore.get('qc_refresh')?.value && !justRefreshed) {
      redirect(`/api/auth/refresh?returnTo=${encodeURIComponent(destination)}`);
    }
    redirect('/login?expired=1');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (res.status === 401) {
    if (justRefreshed) return res;
    const destination = safeReturnTo(returnTo);
    redirect(`/api/auth/refresh?returnTo=${encodeURIComponent(destination)}`);
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
