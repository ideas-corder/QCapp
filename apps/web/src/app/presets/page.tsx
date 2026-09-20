/**
 * Filter Presets admin form — REMOVED 2026-09-03.
 *
 * The user-managed + 3 built-in filter presets (Critical Failures /
 * Pending Sync / Failed Last 7 Days) were retired. The Inspections
 * index already exposes per-column funnel popovers with the same
 * filter shape, so the parallel preset mechanism was redundant. The
 * built-in presets in particular had no user outside the seed. The
 * FilterPresetsModule + filter_presets table are being removed in the
 * same change. The corresponding /presets page now permanently
 * redirects to /inspections.
 *
 * This stub is kept so any surviving deep link resolves cleanly (no
 * 404) and any stale browser tab / bookmark redirects to the
 * inspections list instead of asking the user to log in again.
 *
 * To restore: reintroduce FilterPresetsModule on the api side and the
 * Sidebar link from git history.
 */
import { redirect } from 'next/navigation';

export default function PresetsPage(): never {
  // Permanent redirect — never renders. The `never` return is
  // intentional: `redirect()` throws internally, so this function
  // doesn't actually return, and Next.js's page renderer doesn't
  // expect it to.
  redirect('/inspections');
}
