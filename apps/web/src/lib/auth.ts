// Server-only helpers for reading the caller's identity out of the
// `qc_access` JWT cookie. The cookie is set by /api/auth/set after a
// successful login and is HttpOnly so client JS cannot read it — these
// helpers run only on the server (page.tsx / layout.tsx / route handlers).
//
// We intentionally do NOT verify the JWT signature here. The signature
// is verified on the API side (`JwtAuthGuard` in NestJS) on every
// request. These helpers exist purely to surface the role + email so
// the UI can render the right sidebar / role badge / page guards
// without an extra /auth/me round-trip on every navigation.
//
// If you change the cookie name or JWT claim names, update both this
// file and the corresponding code in apps/api/src/auth.

import { cookies } from 'next/headers';

export const ACCESS_COOKIE = 'qc_access';

export type UserRole = 'admin' | 'inspector' | 'viewer';

export interface CallerIdentity {
  userId: string;
  email: string;
  role: UserRole;
  isSuperAdmin: boolean;
}

/**
 * Read the caller identity out of the `qc_access` cookie without
 * verifying the signature. Returns `null` if the cookie is missing or
 * the JWT payload doesn't have the expected shape.
 *
 * Used by the root layout to render the right role badge in the
 * header and by the sidebar to filter links by role.
 */
export function getCallerFromCookie(): CallerIdentity | null {
  const token = cookies().get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let payload = parts[1];
  // base64url -> base64
  payload = payload.replace(/-/g, '+').replace(/_/g, '/');
  while (payload.length % 4 !== 0) payload += '=';
  try {
    const json = JSON.parse(
      Buffer.from(payload, 'base64').toString('utf8'),
    ) as {
      sub?: string;
      email?: string;
      role?: string;
      isSuperAdmin?: boolean;
    };
    if (!json.sub || !json.role) return null;
    const role = String(json.role).toLowerCase() as UserRole;
    if (role !== 'admin' && role !== 'inspector' && role !== 'viewer') {
      return null;
    }
    return {
      userId: json.sub,
      email: json.email ?? '',
      role,
      isSuperAdmin: !!json.isSuperAdmin,
    };
  } catch {
    return null;
  }
}

/**
 * Convenience: "does this role have permission to access pages that
 * the API gates as @Roles('admin', …)?". Used by the page guards
 * (and by Sidebar to filter the Records section).
 */
export function canManageMasters(role: UserRole, isSuperAdmin: boolean): boolean {
  // Only admins can manage reference data (product categories,
  // inspection types, AQL master, inspectors, suppliers).
  return role === 'admin';
}

/**
 * Convenience: "can this caller manage the Users master?"
 * Only super-admins can.
 */
export function canManageUsers(isSuperAdmin: boolean): boolean {
  return isSuperAdmin;
}
