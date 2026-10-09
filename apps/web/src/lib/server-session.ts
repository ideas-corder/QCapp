import { headers } from 'next/headers';
import type { CallerIdentity } from '@/lib/auth';

/**
 * Return the identity that middleware already verified through /auth/me.
 * Protected routes always pass through middleware, so no page-level API call
 * or JWT decoding is needed here.
 */
export function requireCurrentUser(): CallerIdentity {
  const value = headers().get('x-qc-caller');
  if (!value) {
    throw new Error('Missing verified caller identity from middleware');
  }

  try {
    const caller = JSON.parse(decodeURIComponent(value)) as CallerIdentity;
    if (
      !caller.userId ||
      (caller.role !== 'admin' &&
        caller.role !== 'inspector' &&
        caller.role !== 'viewer')
    ) {
      throw new Error('Invalid caller identity');
    }
    return caller;
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid caller identity') {
      throw error;
    }
    throw new Error('Invalid verified caller identity from middleware');
  }
}
