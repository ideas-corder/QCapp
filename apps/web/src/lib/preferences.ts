import { cookies } from 'next/headers';
import type { UiLayout } from './uiLayout';

/**
 * Read the user's preferred New Inspection form layout.
 *
 * Resolution order:
 *   1. `qc_ui_layout` cookie — set by the layout switcher for instant SSR.
 *   2. 'modern' as a safe default.
 *
 * The DB column on `users.ui_layout` is the source of truth across devices,
 * but reading it on every render would cost an extra round-trip to the API.
 * The cookie is a near-instant cache that the switcher keeps in sync via
 * PUT /auth/preferences.
 */
export function getUiLayoutFromCookie(): UiLayout {
  const v = cookies().get('qc_ui_layout')?.value;
  if (v === 'classic' || v === 'modern') return v;
  return 'modern';
}
