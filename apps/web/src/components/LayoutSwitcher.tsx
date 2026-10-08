'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UI_LAYOUTS, isUiLayout, type UiLayout } from '@/lib/uiLayout';
import { clientApiFetch } from '@/lib/api-client';

/**
 * Topbar dropdown that lets the user switch the New Inspection form
 * between two layouts: 'modern' (default, neutral palette, always-expanded
 * step cards) and 'classic' (green palette, collapsible step cards).
 *
 * The choice is persisted three places, in order:
 *   1. localStorage — instant across reloads in the same browser.
 *   2. `qc_ui_layout` cookie — readable by Server Components so the
 *      picked layout renders on the very next SSR round-trip without a
 *      layout flash.
 *   3. PUT /api/backend/auth/preferences — DB-backed, so the choice
 *      follows the user across browsers / devices.
 *
 * The router is refreshed after the save so server-rendered layouts
 * pick up the new cookie on the very next navigation.
 */
export default function LayoutSwitcher({ current }: { current: UiLayout }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<UiLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  async function pick(next: UiLayout) {
    if (next === current) {
      setOpen(false);
      return;
    }
    setError(null);
    setSaving(next);
    // 1) localStorage — instant.
    try {
      window.localStorage.setItem('qc_ui_layout', next);
    } catch {
      /* ignore quota errors */
    }
    // 2) cookie — set with a long Max-Age so SSR picks it up next render.
    document.cookie = `qc_ui_layout=${next}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    setOpen(false);
    // 3) PUT to the backend so the choice survives across devices.
    try {
      const r = await clientApiFetch('/auth/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiLayout: next }),
        credentials: 'include',
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `HTTP ${r.status}`);
      }
      // Ask Next.js to re-render server components with the new cookie.
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save preference');
    } finally {
      setSaving(null);
    }
  }

  // Read localStorage on mount in case the cookie was cleared but the
  // browser still remembers the user's choice.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('qc_ui_layout');
      if (isUiLayout(stored) && stored !== current) {
        document.cookie = `qc_ui_layout=${stored}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
        router.refresh();
      }
    } catch {
      /* ignore */
    }
    // We intentionally only run on mount — `current`/`router` are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentMeta = UI_LAYOUTS.find((l) => l.id === current) ?? UI_LAYOUTS[0];

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-stone-200 bg-white hover:bg-stone-50 transition-colors text-stone-700"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch the New Inspection form layout"
      >
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
        <span>Layout:</span>
        <span className="font-semibold text-stone-900">{currentMeta.label}</span>
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-2 w-80 z-50 bg-white border border-stone-200 rounded-xl shadow-xl p-2"
        >
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-stone-400">
            New Inspection layout
          </div>
          {UI_LAYOUTS.map((opt) => {
            const selected = opt.id === current;
            const loading = saving === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => pick(opt.id)}
                disabled={saving !== null}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-start gap-3 ${
                  selected ? 'bg-qc/5 ring-1 ring-qc/30' : 'hover:bg-stone-50'
                }`}
              >
                <span
                  className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border ${
                    selected
                      ? 'bg-qc text-qc-on border-qc'
                      : 'bg-white text-stone-500 border-stone-300'
                  }`}
                  aria-hidden="true"
                >
                  {selected ? '✓' : opt.label[0]}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-stone-900">
                    {opt.label}
                    {loading && (
                      <span className="ml-2 text-xs font-normal text-stone-500">
                        saving…
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-stone-500 mt-0.5 leading-snug">
                    {opt.blurb}
                  </span>
                </span>
              </button>
            );
          })}
          {error && (
            <div className="px-3 py-2 mt-1 text-xs text-reject-deep bg-reject-soft border border-reject-border rounded-md">
              {error}
            </div>
          )}
          <div className="px-3 py-2 mt-1 text-[11px] text-stone-400 leading-snug border-t border-stone-100">
            Your choice is saved to your account and applies on this device.
          </div>
        </div>
      )}
    </div>
  );
}
