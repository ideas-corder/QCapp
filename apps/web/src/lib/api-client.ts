// Client-safe API utilities (no next/headers imports).
const API = '/api/backend';

/**
 * Shared browser-side request path. The Next.js backend proxy performs the
 * refresh-and-retry. A 401 returned from it is therefore final: refresh was
 * unavailable or failed, so clear the session and send the user to login.
 */
export async function clientApiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith(API) ? path : `${API}${path}`;
  const res = await fetch(url, { ...init, credentials: 'same-origin' });

  if (res.status === 401 && typeof window !== 'undefined') {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => undefined);
    window.location.replace('/login?expired=1');
  }

  return res;
}

/**
 * Translate an API error body into a short, user-friendly sentence.
 *
 * NestJS + class-validator responses look like:
 *   { message: string | string[], error: string, statusCode: number }
 *
 * For auth specifically the body is almost always
 *   { message: "Invalid credentials", error: "Unauthorized", statusCode: 401 }
 * or a class-validator 400 with `message: ["email must be an email", ...]`.
 * We pull the first human-readable sentence and surface that in the UI.
 */
export function friendlyApiError(status: number, raw: string): string {
  const fallback = `Login failed (${status})`;
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as {
      message?: string | string[];
      error?: string;
    };
    const msgs = Array.isArray(parsed.message)
      ? parsed.message
      : parsed.message
        ? [parsed.message]
        : [];
    const translated = msgs.map((m) => {
      const lower = String(m).toLowerCase();
      if (lower.includes('invalid credentials')) return 'Invalid email or password.';
      if (lower.includes('user inactive')) return 'This account is inactive. Contact an admin.';
      if (lower.includes('mfa session expired')) return 'MFA session expired — please sign in again.';
      if (lower.includes('invalid authenticator code') || lower.includes('invalid mfa session'))
        return 'Invalid authenticator code.';
      if (lower.includes('mfa not configured')) return 'MFA is not set up for this account.';
      if (lower.includes('invalid refresh token')) return 'Session expired — please sign in again.';
      if (lower.includes('email must be an email')) return 'Please enter a valid email address.';
      return String(m);
    });
    if (translated.length === 0) return fallback;
    return translated.join(' ');
  } catch {
    return raw.length < 200 ? raw : fallback;
  }
}

export async function apiLogin(
  email: string,
  password: string,
): Promise<
  | { mode: 'authenticated'; accessToken: string; refreshToken: string; user: any }
  | { mode: 'mfa_required'; mfaPendingToken: string }
> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(friendlyApiError(res.status, body));
  }
  return res.json();
}

export async function apiLoginMfa(
  mfaPendingToken: string,
  totpCode: string,
) {
  const res = await fetch(`${API}/auth/login/mfa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mfaPendingToken, totpCode }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(friendlyApiError(res.status, body));
  }
  return res.json();
}
