// Server-only API utilities. Must NOT be imported from client components.
import { cookies } from 'next/headers';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export async function apiFetch<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = cookies().get('qc_access')?.value;
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API}${path}`, { ...init, headers, cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  if (res.headers.get('content-type')?.includes('application/json')) {
    return res.json();
  }
  return undefined as unknown as T;
}

export async function apiFetchOptional<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T | null> {
  try {
    return await apiFetch<T>(path, init);
  } catch {
    return null;
  }
}

export { apiLogin, apiLoginMfa } from './api-client';
