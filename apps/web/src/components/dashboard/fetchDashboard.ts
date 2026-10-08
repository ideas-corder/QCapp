/**
 * Server-side helper that hits `/inspections/dashboard` with the
 * caller's cookie token and returns the parsed stats or a normalised
 * `{ error }` shape so the route can render the same error UI.
 */
import { serverApiRequest } from '@/lib/api';

export type DashboardFetchResult =
  | { ok: true; stats: any }
  | { ok: false; error: string };

/**
 * Translate NestJS / class-validator error bodies into a short,
 * user-facing sentence. The web page renders whatever string we put
 * in `error`, so without this we'd leak JSON dumps like
 *   {"message":"Required role: admin or viewer (your role: inspector)",
 *    "error":"Forbidden","statusCode":403}
 * into the dashboard error UI.
 */
function friendlyApiError(status: number, raw: string): string {
  const fallback = `API returned ${status}.`;
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as {
      message?: string | string[];
      error?: string;
      statusCode?: number;
    };
    const msgs = Array.isArray(parsed.message)
      ? parsed.message
      : parsed.message
        ? [parsed.message]
        : [];
    const translated = msgs.map((m) => {
      const lower = String(m).toLowerCase();
      if (lower.includes('required role:'))
        return 'You do not have access to this dashboard. Contact an admin.';
      if (lower.includes('unauthorized') || lower.includes('invalid token'))
        return 'Your session has expired. Please sign in again.';
      if (lower.includes('forbidden')) return 'You do not have access to this page.';
      if (lower.includes('not found')) return 'The requested resource was not found.';
      return String(m);
    });
    if (translated.length === 0) return fallback;
    return translated.join(' ');
  } catch {
    return raw.length < 200 ? raw : fallback;
  }
}

export async function fetchDashboardStats(
  returnTo = '/dashboard',
): Promise<DashboardFetchResult> {
  let res: Response;
  try {
    res = await serverApiRequest(
      '/inspections/dashboard',
      {},
      returnTo,
    );
  } catch (err: any) {
    if (String(err?.digest ?? '').startsWith('NEXT_REDIRECT')) throw err;
    return {
      ok: false,
      error: `Network error reaching API: ${err?.message ?? String(err)}`,
    };
  }
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      error: friendlyApiError(res.status, body),
    };
  }
  try {
    return { ok: true, stats: await res.json() };
  } catch (err: any) {
    return {
      ok: false,
      error: `API responded but body was not JSON: ${err?.message ?? String(err)}`,
    };
  }
}
