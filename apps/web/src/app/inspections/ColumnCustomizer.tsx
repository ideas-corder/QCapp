'use client';
import { useEffect, useRef, useState } from 'react';
import {
  type ColumnDef,
  COLUMNS,
  DEFAULT_COLUMN_ORDER,
  DEFAULT_VISIBLE_KEYS,
  DEFAULT_WIDTHS,
} from './columns';
import type { ColumnFilterValue } from './ColumnFilter';

/**
 * Layout state held by the parent (`InspectionsGrid`). A "layout"
 * captures everything the user has chosen: which columns are visible,
 * the order they're shown in, the per-column pixel widths, the sort
 * that was active when the layout was saved, and (optionally) the
 * per-column filters that were applied. Saved views can replay the
 * filters on load so the user can store curated slices of the data.
 *
 * An empty layout means "use defaults" — the parent fills it in.
 */
export type LayoutState = {
  visibleKeys: string[];
  columnOrder: string[];
  widths: Record<string, number>;
  sortBy: string;
  filters?: Record<string, ColumnFilterValue>;
};

export function defaultLayout(): LayoutState {
  return {
    visibleKeys: [...DEFAULT_VISIBLE_KEYS],
    columnOrder: [...DEFAULT_COLUMN_ORDER],
    widths: { ...DEFAULT_WIDTHS },
    sortBy: 'DATE_DESC',
    filters: {},
  };
}

/**
 * Reconcile a persisted layout with the live column definitions.
 *  - unknown keys are dropped silently
 *  - required columns are force-added (radio + actions) so the user
 *    can never lock themselves out of selecting a row
 *  - new columns introduced after the view was saved are appended
 *    in their canonical order so the user sees them on next load
 */
export function reconcileLayout(layout: Partial<LayoutState> | null | undefined): LayoutState {
  const def = defaultLayout();
  if (!layout) return def;
  const allKeys = COLUMNS.map((c) => c.key);
  const order = (layout.columnOrder ?? []).filter((k) => allKeys.includes(k));
  // Append any new columns not in the saved order, preserving canonical order
  for (const k of allKeys) {
    if (!order.includes(k)) order.push(k);
  }
  const visibleRaw = layout.visibleKeys ?? order;
  const visibleSet = new Set(visibleRaw.filter((k) => allKeys.includes(k)));
  // Force-include required columns
  for (const c of COLUMNS) {
    if (c.required) visibleSet.add(c.key);
  }
  const widths: Record<string, number> = { ...def.widths, ...(layout.widths ?? {}) };
  // Fill in any widths the saved view didn't cover (e.g. a new column)
  for (const c of COLUMNS) {
    if (widths[c.key] == null) widths[c.key] = c.defaultWidth;
  }
  return {
    visibleKeys: Array.from(visibleSet),
    columnOrder: order,
    widths,
    sortBy: layout.sortBy ?? def.sortBy,
  };
}

/** Visible, ordered columns derived from a layout. */
export function visibleOrderedColumns(layout: LayoutState): ColumnDef[] {
  const byKey = new Map(COLUMNS.map((c) => [c.key, c]));
  const cols: ColumnDef[] = [];
  for (const k of layout.columnOrder) {
    if (!layout.visibleKeys.includes(k)) continue;
    const c = byKey.get(k);
    if (c) cols.push(c);
  }
  return cols;
}

/**
 * Saved view row (server response). `layout` is the same shape as
 * `LayoutState` minus the keys we always derive from defaults.
 */
export type SavedView = {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  layout: Partial<LayoutState>;
  ownerId: string | null;
  updatedAt: string;
};

const API = '/api/backend';

/**
 * The "Customize columns" popover.
 *
 *  - Click a checkbox to show / hide a column
 *  - Drag the ⋮⋮ handle to reorder columns (required columns are
 *    pinned at their current slot and not draggable)
 *  - Use the slider next to each visible column to set its pixel
 *    width (changes are committed to the parent on the fly)
 *  - Save the current state as a named view, load a saved view, or
 *    delete one you own. Built-ins can't be deleted or renamed.
 */
export default function ColumnCustomizer({
  layout,
  savedViews,
  onLayoutChange,
  onLoadView,
  onSaveAs,
  onDeleteView,
}: {
  layout: LayoutState;
  savedViews: SavedView[];
  onLayoutChange: (next: LayoutState) => void;
  onLoadView: (v: SavedView) => void;
  onSaveAs: (name: string) => Promise<unknown>;
  onDeleteView: (v: SavedView) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(key: string) {
    const col = COLUMNS.find((c) => c.key === key);
    if (col?.required) return; // pinned
    const set = new Set(layout.visibleKeys);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    onLayoutChange({ ...layout, visibleKeys: Array.from(set) });
  }

  function reorder(srcKey: string, beforeKey: string | null) {
    const col = COLUMNS.find((c) => c.key === srcKey);
    if (col?.required) return; // pinned
    const order = layout.columnOrder.filter((k) => k !== srcKey);
    if (beforeKey == null) {
      order.push(srcKey);
    } else {
      const idx = order.indexOf(beforeKey);
      order.splice(idx >= 0 ? idx : order.length, 0, srcKey);
    }
    onLayoutChange({ ...layout, columnOrder: order });
  }

  function setWidth(key: string, w: number) {
    onLayoutChange({ ...layout, widths: { ...layout.widths, [key]: w } });
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-1.5 rounded border border-stone-300 bg-white hover:bg-stone-50 text-sm"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        Columns
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Customize columns"
          className="absolute right-0 top-full mt-1 w-[460px] max-h-[70vh] overflow-auto bg-white border border-stone-200 rounded-lg shadow-lg z-20 p-3 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-700">Columns</span>
            <button
              type="button"
              className="text-xs text-stone-500 hover:text-stone-700 underline"
              onClick={() => onLayoutChange(defaultLayout())}
            >
              Reset to default
            </button>
          </div>

          <ColumnList
            layout={layout}
            onToggle={toggle}
            onReorder={reorder}
            onWidthChange={setWidth}
          />

          <hr className="border-stone-200" />

          <SavedViewsPanel
            savedViews={savedViews}
            onLoadView={onLoadView}
            onDeleteView={onDeleteView}
          />

          <hr className="border-stone-200" />

          <SaveAsPanel
            disabled={saving}
            value={saveName}
            onChange={setSaveName}
            onSubmit={async () => {
              if (!saveName.trim()) return;
              setSaving(true);
              try {
                await onSaveAs(saveName.trim());
                setSaveName('');
              } finally {
                setSaving(false);
              }
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function ColumnList({
  layout,
  onToggle,
  onReorder,
  onWidthChange,
}: {
  layout: LayoutState;
  onToggle: (k: string) => void;
  onReorder: (src: string, before: string | null) => void;
  onWidthChange: (k: string, w: number) => void;
}) {
  const dragKey = useRef<string | null>(null);

  return (
    <ul className="space-y-1">
      {layout.columnOrder.map((key) => {
        const col = COLUMNS.find((c) => c.key === key);
        if (!col) return null;
        const visible = layout.visibleKeys.includes(key);
        const width = layout.widths[key] ?? col.defaultWidth;
        const min = col.minWidth ?? 60;
        const max = 600;
        const isRequired = !!col.required;
        return (
          <li
            key={key}
            draggable={!isRequired}
            onDragStart={(e) => {
              dragKey.current = key;
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', key);
            }}
            onDragOver={(e) => {
              if (!dragKey.current || dragKey.current === key) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              e.preventDefault();
              const src = dragKey.current;
              dragKey.current = null;
              if (src && src !== key) onReorder(src, key);
            }}
            onDragEnd={() => {
              dragKey.current = null;
            }}
            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-stone-50"
          >
            {!isRequired ? (
              <span
                aria-hidden="true"
                className="cursor-grab text-stone-400 select-none"
                title="Drag to reorder"
              >
                ⋮⋮
              </span>
            ) : (
              <span className="w-3 inline-block" />
            )}
            <label className="flex items-center gap-2 flex-1 cursor-pointer">
              <input
                type="checkbox"
                checked={visible}
                disabled={isRequired}
                onChange={() => onToggle(key)}
              />
              <span className="text-sm text-stone-700 flex-1">
                {col.label || (
                  <span className="italic text-stone-400">(unnamed)</span>
                )}
                {isRequired ? (
                  <span className="ml-1 text-xs text-stone-400">(required)</span>
                ) : null}
              </span>
            </label>
            <input
              type="range"
              min={min}
              max={max}
              step={5}
              value={width}
              disabled={!visible}
              onChange={(e) => onWidthChange(key, Number(e.target.value))}
              className="w-28 accent-qc-deep"
              title={`${width}px`}
            />
            <span className="text-xs text-stone-500 w-10 text-right tabular-nums">
              {width}px
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function SavedViewsPanel({
  savedViews,
  onLoadView,
  onDeleteView,
}: {
  savedViews: SavedView[];
  onLoadView: (v: SavedView) => void;
  onDeleteView: (v: SavedView) => Promise<unknown>;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-stone-500 mb-1">Saved views</div>
      {savedViews.length === 0 ? (
        <div className="text-xs text-stone-400 italic">No saved views yet.</div>
      ) : (
        <ul className="space-y-1">
          {savedViews.map((v) => (
            <li key={v.id} className="flex items-center gap-2 text-sm">
              <button
                type="button"
                className="flex-1 text-left text-qc-deep hover:underline truncate"
                onClick={() => onLoadView(v)}
                title={v.description || v.name}
              >
                {v.name}
                {v.isBuiltIn ? (
                  <span className="ml-1 text-xs text-stone-400">(built-in)</span>
                ) : null}
              </button>
              {!v.isBuiltIn ? (
                <button
                  type="button"
                  className="text-xs text-reject-deep hover:underline"
                  onClick={() => onDeleteView(v)}
                >
                  Delete
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SaveAsPanel({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Save current layout as…"
        className="flex-1 border border-stone-300 rounded px-2 py-1 text-sm"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="px-3 py-1 text-sm rounded bg-qc-strong text-qc-on disabled:bg-stone-200 disabled:text-stone-500"
      >
        Save as new view
      </button>
    </form>
  );
}

/**
 * Helper to load saved views from the API. Returns the array (or
 * `[]` on any failure — the caller can show "No saved views").
 */
export async function fetchSavedViews(): Promise<SavedView[]> {
  try {
    const res = await fetch(`${API}/inspection-views`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return (await res.json()) as SavedView[];
  } catch {
    return [];
  }
}

/** POST a new view. */
export async function createView(
  name: string,
  layout: LayoutState,
): Promise<SavedView> {
  const res = await fetch(`${API}/inspection-views`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description: '',
      layout: serialiseLayout(layout),
    }),
  });
  if (!res.ok) throw new Error(`create view failed: ${res.status}`);
  return (await res.json()) as SavedView;
}

/** PUT an updated layout on an existing view. */
export async function updateView(
  id: string,
  layout: LayoutState,
): Promise<SavedView> {
  const res = await fetch(`${API}/inspection-views/${id}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layout: serialiseLayout(layout) }),
  });
  if (!res.ok) throw new Error(`update view failed: ${res.status}`);
  return (await res.json()) as SavedView;
}

export async function deleteView(id: string): Promise<void> {
  const res = await fetch(`${API}/inspection-views/${id}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  if (!res.ok && res.status !== 204) throw new Error(`delete view failed: ${res.status}`);
}

/** Strip the runtime-only fields before sending to the server. */
function serialiseLayout(layout: LayoutState) {
  return {
    columnOrder: layout.columnOrder,
    hiddenColumns: COLUMNS.map((c) => c.key).filter(
      (k) => !layout.visibleKeys.includes(k),
    ),
    widths: layout.widths,
    sortBy: layout.sortBy,
  };
}