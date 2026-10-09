import 'server-only';
import { createHash } from 'node:crypto';
import { API_BASE } from '@/lib/config';

export type RefreshedTokens = {
  accessToken?: string;
  refreshToken?: string;
};

type CachedRefresh = {
  tokens: RefreshedTokens;
  expiresAt: number;
};

const SUCCESS_TTL_MS = 15_000;
const MAX_CACHE_ENTRIES = 500;
const refreshOperations = new Map<string, Promise<RefreshedTokens>>();
const successfulRefreshes = new Map<string, CachedRefresh>();

async function refreshAccessToken(
  refreshToken: string,
): Promise<RefreshedTokens> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
    if (!response.ok) return {};
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') return {};
    const candidate = body as Record<string, unknown>;
    return {
      accessToken:
        typeof candidate.accessToken === 'string'
          ? candidate.accessToken
          : undefined,
      refreshToken:
        typeof candidate.refreshToken === 'string'
          ? candidate.refreshToken
          : undefined,
    };
  } catch {
    return {};
  }
}

function refreshSessionKey(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}

function cacheSuccessfulRefresh(
  key: string,
  tokens: RefreshedTokens,
): void {
  const now = Date.now();

  if (successfulRefreshes.size >= MAX_CACHE_ENTRIES) {
    for (const [cachedKey, cached] of successfulRefreshes) {
      if (cached.expiresAt <= now) successfulRefreshes.delete(cachedKey);
    }
  }

  while (successfulRefreshes.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = successfulRefreshes.keys().next().value as
      | string
      | undefined;
    if (!oldestKey) break;
    successfulRefreshes.delete(oldestKey);
  }

  successfulRefreshes.set(key, {
    tokens,
    expiresAt: now + SUCCESS_TTL_MS,
  });
}

/**
 * Deduplicate concurrent refreshes and briefly reuse successful results.
 * The success cache protects refresh-token rotation from races caused by
 * parallel navigations, RSC requests, and prefetches that still carry the old
 * refresh-token cookie. Failures are deliberately never cached.
 */
export function refreshAccessTokenOnce(
  refreshToken: string,
): Promise<RefreshedTokens> {
  const key = refreshSessionKey(refreshToken);
  const cached = successfulRefreshes.get(key);
  if (cached) {
    if (cached.expiresAt > Date.now()) return Promise.resolve(cached.tokens);
    successfulRefreshes.delete(key);
  }

  const existing = refreshOperations.get(key);
  if (existing) return existing;

  const operation = refreshAccessToken(refreshToken)
    .then((tokens) => {
      if (tokens.accessToken) cacheSuccessfulRefresh(key, tokens);
      return tokens;
    })
    .finally(() => {
      if (refreshOperations.get(key) === operation) {
        refreshOperations.delete(key);
      }
    });

  refreshOperations.set(key, operation);
  return operation;
}
