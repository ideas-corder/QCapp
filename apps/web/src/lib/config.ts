// Edge-safe shared configuration: do not add Node-only imports here because
// middleware imports this module.
export const API_BASE =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3002';

function positiveSeconds(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const ACCESS_COOKIE_MAX_AGE_SECONDS = positiveSeconds(
  process.env.QC_ACCESS_COOKIE_MAX_AGE_SECONDS,
  60 * 60 * 12,
);

export const REFRESH_COOKIE_MAX_AGE_SECONDS = positiveSeconds(
  process.env.QC_REFRESH_COOKIE_MAX_AGE_SECONDS,
  60 * 60 * 24 * 30,
);
