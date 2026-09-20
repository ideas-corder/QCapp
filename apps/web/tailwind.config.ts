import type { Config } from 'tailwindcss';

/**
 * Theme tokens are defined as CSS custom properties in globals.css so the
 * ThemeProvider can update them at runtime (see ThemeProvider.tsx). Default
 * values match the original palette; per-user choices land in localStorage.
 *
 * Tailwind classes that consume these tokens:
 *   bg-qc / text-qc / border-qc / ring-qc       -> --brand            (qc-500)
 *   bg-qc-strong / text-qc-strong              -> --brand-strong     (qc-600)
 *   bg-qc-deep / text-qc-deep                  -> --brand-deep       (qc-700)
 *   bg-qc-soft / text-qc-soft                  -> --brand-soft       (qc-50)
 *   bg-qc-border / border-qc-border            -> --brand-border     (qc-200)
 *   bg-qc-on / text-qc-on                      -> --brand-on
 *
 * The `qc-100` / `qc-300` / `qc-400` / `qc-800` / `qc-900` shades are
 * derived from the same base HSL — see the colourScale comment below —
 * so the full 50–900 ramp renders consistently whenever the user changes
 * the theme. Without these, classes like `bg-qc-600`, `text-qc-700`,
 * `border-qc-200` silently get dropped by Tailwind and the affected
 * element ends up with no background / no border / invisible text.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        qc: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          // Full Tailwind-style ramp (50..900) anchored on --brand-strong
          // (qc-600). Pick 600 as the anchor so the visual weight matches
          // the rest of the design system; the lighter / darker shades
          // are interpolations along the same HSL value triplet.
          50:  'rgb(var(--brand-soft) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-border) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand) / <alpha-value>)',
          600: 'rgb(var(--brand-strong) / <alpha-value>)',
          700: 'rgb(var(--brand-deep) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
          // Named aliases kept for code that already used them.
          strong: 'rgb(var(--brand-strong) / <alpha-value>)',
          deep:   'rgb(var(--brand-deep) / <alpha-value>)',
          soft:   'rgb(var(--brand-soft) / <alpha-value>)',
          border: 'rgb(var(--brand-border) / <alpha-value>)',
          on:     'rgb(var(--brand-on) / <alpha-value>)',
        },
        sidebar: {
          DEFAULT: 'rgb(var(--sidebar-bg) / <alpha-value>)',
          border: 'rgb(var(--sidebar-border) / <alpha-value>)',
          text: 'rgb(var(--sidebar-text) / <alpha-value>)',
          muted: 'rgb(var(--sidebar-text-muted) / <alpha-value>)',
        },
        accept: {
          DEFAULT: 'rgb(var(--accept) / <alpha-value>)',
          soft: 'rgb(var(--accept-soft) / <alpha-value>)',
          border: 'rgb(var(--accept-border) / <alpha-value>)',
          deep: 'rgb(var(--accept-deep) / <alpha-value>)',
        },
        reject: {
          DEFAULT: 'rgb(var(--reject) / <alpha-value>)',
          soft: 'rgb(var(--reject-soft) / <alpha-value>)',
          border: 'rgb(var(--reject-border) / <alpha-value>)',
          deep: 'rgb(var(--reject-deep) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          border: 'rgb(var(--card-border) / <alpha-value>)',
          on: 'rgb(var(--card-on) / <alpha-value>)',
        },
        pass: 'rgb(var(--accept-deep) / <alpha-value>)',
        fail: 'rgb(var(--reject-deep) / <alpha-value>)',
        rework: '#b45309', // amber-700 — distinct from fail-red
        pending: 'rgb(var(--brand-deep) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};

export default config;
