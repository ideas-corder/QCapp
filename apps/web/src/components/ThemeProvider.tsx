'use client';

/**
 * ThemeProvider
 *
 * Reads user color choices from localStorage on mount and applies them as CSS
 * custom properties on <html>. Every component that uses Tailwind tokens like
 * `bg-qc`, `text-sidebar-muted`, `bg-accept-soft`, etc. picks up the changes
 * automatically because the Tailwind palette is defined as `rgb(var(--token))`.
 *
 * Tokens managed (keyed as `R G B` triplets so Tailwind alpha modifiers work):
 *   --brand, --brand-strong, --brand-deep, --brand-on
 *   --sidebar-bg, --sidebar-border, --sidebar-text, --sidebar-text-muted
 *   --accept, --accept-soft, --accept-border, --accept-deep
 *   --reject, --reject-soft, --reject-border, --reject-deep
 *   --card, --card-border, --card-on        (StepCard header on /inspections/new)
 *
 * For each "base" color we expose 5 derived values:
 *   DEFAULT  : the picked color
 *   STRONG   : 15% darker (for hover/active)
 *   DEEP     : 30% darker (for pressed)
 *   ON       : white or near-black depending on luminance (text on color)
 *   SOFT     : 90% lighter (for chip backgrounds)
 *   BORDER   : 70% lighter (for chip borders)
 *   DEEP-TXT : 30% darker (for chip text)
 *
 * The card family is a special case: the user picks ONE base lightness/sat
 * and we derive card / card-border / card-on from it (header bg, header
 * bottom rule, header text). Same pattern as the other base colors.
 *
 * The picker UI in /settings uses HSL sliders. Internally we store HSL for
 * the base colors and re-derive the rest on the fly.
 */

import { useEffect } from 'react';

export type Hsl = { h: number; s: number; l: number };

export interface ThemeState {
  brand: Hsl;
  sidebar: Hsl;
  accept: Hsl;
  reject: Hsl;
  card: Hsl;
}

export const DEFAULT_THEME: ThemeState = {
  brand: { h: 201, s: 98, l: 39 }, // sky-500ish (#0284c7)
  sidebar: { h: 24, s: 11, l: 10 }, // stone-900ish (#1c1917)
  accept: { h: 142, s: 71, l: 36 }, // green-600ish (#16a34a)
  reject: { h: 0, s: 73, l: 51 }, // red-600ish (#dc2626)
  card: { h: 210, s: 40, l: 96 }, // slate-100ish (#f1f5f9) — StepCard header bg
};

export const THEME_STORAGE_KEY = 'qc.theme.v1';

/** Convert HSL -> "R G B" triple suitable for rgb(var(...)/alpha). */
export function hslToRgbTriplet({ h, s, l }: Hsl): string {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hh = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hh < 1) { r1 = c; g1 = x; }
  else if (hh < 2) { r1 = x; g1 = c; }
  else if (hh < 3) { g1 = c; b1 = x; }
  else if (hh < 4) { g1 = x; b1 = c; }
  else if (hh < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = light - c / 2;
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return `${r} ${g} ${b}`;
}

/** Relative luminance (0..1) using the sRGB formula. */
export function relLuminance({ h, s, l }: Hsl): number {
  const { r, g, b } = hslToRgb({ h, s, l });
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function hslToRgb({ h, s, l }: Hsl): { r: number; g: number; b: number } {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hh < 1) { r1 = c; g1 = x; }
  else if (hh < 2) { r1 = x; g1 = c; }
  else if (hh < 3) { g1 = c; b1 = x; }
  else if (hh < 4) { g1 = x; b1 = c; }
  else if (hh < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = light - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/** Move HSL lightness by delta and clamp to 0..100. */
export function withL(hsl: Hsl, delta: number): Hsl {
  return { ...hsl, l: Math.max(0, Math.min(100, hsl.l + delta)) };
}

/** Build the four CSS-var strings we set for a single base color. */
export function deriveVars(base: Hsl) {
  const strong = withL(base, -10);
  const deep = withL(base, -22);
  const soft = withL(base, +38);
  const border = withL(base, +22);
  const lum = relLuminance(base);
  const on = lum > 0.55 ? '17 24 39' /* near-black */ : '255 255 255';
  return {
    base: hslToRgbTriplet(base),
    strong: hslToRgbTriplet(strong),
    deep: hslToRgbTriplet(deep),
    on,
    soft: hslToRgbTriplet(soft),
    border: hslToRgbTriplet(border),
  };
}

export function applyThemeVars(theme: ThemeState) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const b = deriveVars(theme.brand);
  const s = deriveVars(theme.sidebar);
  const a = deriveVars(theme.accept);
  const r = deriveVars(theme.reject);
  const c = deriveVars(theme.card);

  root.style.setProperty('--brand', b.base);
  root.style.setProperty('--brand-strong', b.strong);
  root.style.setProperty('--brand-deep', b.deep);
  root.style.setProperty('--brand-soft', b.soft);
  root.style.setProperty('--brand-border', b.border);
  root.style.setProperty('--brand-on', b.on);

  root.style.setProperty('--sidebar-bg', s.base);
  root.style.setProperty('--sidebar-border', s.border);
  root.style.setProperty('--sidebar-text', s.on);
  root.style.setProperty('--sidebar-text-muted', withL(theme.sidebar, +45).l >= 100
    ? hslToRgbTriplet({ ...theme.sidebar, l: 65 })
    : hslToRgbTriplet(withL(theme.sidebar, +45)));

  root.style.setProperty('--accept', a.base);
  root.style.setProperty('--accept-soft', a.soft);
  root.style.setProperty('--accept-border', a.border);
  root.style.setProperty('--accept-deep', a.deep);

  root.style.setProperty('--reject', r.base);
  root.style.setProperty('--reject-soft', r.soft);
  root.style.setProperty('--reject-border', r.border);
  root.style.setProperty('--reject-deep', r.deep);

  // Card header (new-inspection form). The user picks ONE base lightness and
  // we derive a header band, a slightly darker bottom rule, and on-color text.
  root.style.setProperty('--card', c.base);
  root.style.setProperty('--card-border', c.border);
  root.style.setProperty('--card-on', c.on);
}

export function loadTheme(): ThemeState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed && typeof parsed === 'object' &&
      parsed.brand && parsed.sidebar && parsed.accept && parsed.reject && parsed.card
    ) {
      return parsed as ThemeState;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function saveTheme(theme: ThemeState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch {
    /* ignore */
  }
}

/** Mounts once at app start. No UI — just keeps <html> tokens in sync with
 * localStorage. Live updates during a session are driven from the Settings
 * page which calls applyThemeVars directly. */
export default function ThemeProvider() {
  useEffect(() => {
    const t = loadTheme();
    if (t) applyThemeVars(t);
    // Listen for storage events from other tabs so settings propagate.
    function onStorage(e: StorageEvent) {
      if (e.key !== THEME_STORAGE_KEY) return;
      const next = loadTheme();
      if (next) applyThemeVars(next);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return null;
}