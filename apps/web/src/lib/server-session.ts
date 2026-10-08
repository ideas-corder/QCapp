import { cache } from 'react';
import { headers } from 'next/headers';
import { apiFetch } from '@/lib/api';
import type { CallerIdentity } from '@/lib/auth';

function currentReturnTo(): string {
  const value = headers().get('x-qc-return-to');
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }
  return value;
}

/**
 * Verify the access token once per Server Component render. React's cache
 * makes layout and page callers share the same /auth/me request. When the
 * access token has expired, serverApiRequest performs one refresh redirect
 * before any page-level parallel data fetching starts.
 */
export const requireCurrentUser = cache(async (): Promise<CallerIdentity> => {
  return apiFetch<CallerIdentity>('/auth/me', {}, currentReturnTo());
});
