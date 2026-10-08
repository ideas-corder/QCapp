'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  applyThemeVars,
  DEFAULT_THEME,
  hslToRgb,
  loadTheme,
  saveTheme,
  ThemeState,
  type Hsl,
} from '@/components/ThemeProvider';

interface ColorSpec {
  key: keyof ThemeState;
  label: string;
  blurb: string;
}

const COLORS: ColorSpec[] = [
  { key: 'brand', label: 'Primary brand', blurb: 'Buttons, section badges, active sidebar item.' },
  { key: 'sidebar', label: 'Sidebar background', blurb: 'Left navigation and sign-out footer.' },
  { key: 'accept', label: 'Accept (PASS) accent', blurb: 'Used for PASS chips and result badges.' },
  { key: 'reject', label: 'Reject (FAIL) accent', blurb: 'Used for FAIL chips and error states.' },
  { key: 'card', label: 'Card header', blurb: 'StepCard header band on the New Inspection form.' },
];

function hex(hsl: Hsl): string {
  const { r, g, b } = hslToRgb(hsl);
  const c = (n: number) => n.toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function ColorEditor({
  spec,
  value,
  onChange,
}: {
  spec: ColorSpec;
  value: Hsl;
  onChange: (next: Hsl) => void;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <span
          className="inline-block h-10 w-10 rounded-md border border-stone-200 shrink-0"
          style={{ background: hex(value) }}
          aria-label={`${spec.label} preview ${hex(value)}`}
        />
        <div>
          <div className="font-semibold text-stone-800">{spec.label}</div>
          <div className="text-xs text-stone-500">{spec.blurb}</div>
        </div>
        <div className="ml-auto font-mono text-xs px-2 py-1 rounded bg-stone-100 text-stone-700">
          {hex(value)}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <label className="text-xs font-medium text-stone-600">
          Hue <span className="font-mono text-stone-400">{value.h}°</span>
          <input
            type="range"
            min={0}
            max={360}
            value={value.h}
            onChange={(e) => onChange({ ...value, h: Number(e.target.value) })}
            className="w-full mt-1 accent-current"
            style={{
              background:
                'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
              height: 8,
              borderRadius: 4,
            }}
          />
        </label>
        <label className="text-xs font-medium text-stone-600">
          Saturation <span className="font-mono text-stone-400">{value.s}%</span>
          <input
            type="range"
            min={0}
            max={100}
            value={value.s}
            onChange={(e) => onChange({ ...value, s: Number(e.target.value) })}
            className="w-full mt-1"
          />
        </label>
        <label className="text-xs font-medium text-stone-600">
          Lightness <span className="font-mono text-stone-400">{value.l}%</span>
          <input
            type="range"
            min={0}
            max={100}
            value={value.l}
            onChange={(e) => onChange({ ...value, l: Number(e.target.value) })}
            className="w-full mt-1"
          />
        </label>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [theme, setTheme] = useState<ThemeState>(DEFAULT_THEME);
  const [hydrated, setHydrated] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    const t = loadTheme() ?? DEFAULT_THEME;
    setTheme(t);
    setHydrated(true);
  }, []);

  const update = useCallback(
    (key: keyof ThemeState) => (next: Hsl) => {
      setTheme((prev) => {
        const merged = { ...prev, [key]: next };
        applyThemeVars(merged);
        saveTheme(merged);
        setSavedAt(Date.now());
        return merged;
      });
    },
    [],
  );

  function reset() {
    setTheme(DEFAULT_THEME);
    applyThemeVars(DEFAULT_THEME);
    saveTheme(DEFAULT_THEME);
    setSavedAt(Date.now());
  }

  return (
    <div className="max-w-3xl">
      <div className="text-xs text-stone-500 mb-1">
        <a href="/dashboard" className="hover:underline">Dashboard</a> › Settings
      </div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Theme settings</h1>
        <button
          onClick={reset}
          className="px-3 py-1.5 text-xs border border-stone-300 rounded hover:bg-stone-50"
        >
          Reset to default
        </button>
      </div>
      <p className="text-sm text-stone-600 mb-6">
        Pick the colors used across the admin portal. Changes are saved to this
        browser only (localStorage). Each slider updates the live preview and the
        rest of the UI instantly.
      </p>

      {!hydrated && (
        <div className="mb-4 p-3 rounded border border-amber-200 bg-amber-50 text-sm text-amber-900">
          Loading saved colors…
        </div>
      )}
      {hydrated && savedAt && (
        <div className="mb-4 p-3 rounded border border-accept-border bg-accept-soft text-accept-deep text-sm">
          ✓ Colors saved.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {COLORS.map((c) => (
          <ColorEditor
            key={c.key}
            spec={c}
            value={theme[c.key]}
            onChange={update(c.key)}
          />
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="font-semibold text-stone-800 mb-3">Live preview</div>
        <div className="flex flex-wrap gap-2">
          <button className="px-3 py-1.5 rounded text-sm bg-qc-strong text-qc-on">
            Primary action
          </button>
          <button className="px-3 py-1.5 rounded text-sm bg-qc-deep text-qc-on">
            Primary deep
          </button>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accept-soft text-accept-deep border border-accept-border">
            ✓ ACCEPT
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-reject-soft text-reject-deep border border-reject-border">
            ✕ REJECT
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-qc/15 text-qc-deep border border-qc/30">
            brand tint
          </span>
        </div>
      </div>
    </div>
  );
}