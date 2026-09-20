/**
 * Format helpers used by the dashboard pages. Kept here (instead of
 * inline) so the same date logic doesn't drift across pages.
 */

/** "26 Aug" — matches the sparkline x-axis label. */
export function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-US', { month: 'short' })}`;
}

/** "30 Aug, 14:32" — used in tables. */
export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleString('en-US', { day: '2-digit', month: 'short' })}, ${d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

/** "2 minutes ago" / "3 hours ago" / "yesterday" / "30 Aug". */
export function fmtRelative(value: string | Date | null | undefined, now = new Date()): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  const dayDiff = Math.floor(diff / 86400);
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff < 7) return `${dayDiff} days ago`;
  return d.toLocaleString('en-US', { day: '2-digit', month: 'short' });
}