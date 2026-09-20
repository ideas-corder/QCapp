'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import InspectionsTable from './InspectionsTable';
import { type Inspection, COLUMNS } from './columns';
import {
  type LayoutState,
  type SavedView,
  defaultLayout,
  fetchSavedViews,
  reconcileLayout,
  visibleOrderedColumns,
} from './ColumnCustomizer';
import ColumnCustomizer from './ColumnCustomizer';
import {
  type ColumnFilterValue,
  isEmptyFilter,
  summariseFilter,
} from './ColumnFilter';

const LS_KEY = 'qc.inspection.layout.current';
const URL_FILTER_PARAM = 'filters';

const RESULT_LABEL: Record<Inspection['overallResult'], string> = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  REWORK: 'REWORK',
  HOLD: 'HOLD',
  REJECTED: 'REJECTED',
  PENDING_REVIEW: 'PENDING REVIEW',
};
const RESULT_BAR: Record<Inspection['overallResult'], string> = {
  PASS: 'bg-accept-deep',
  FAIL: 'bg-reject-deep',
  REWORK: 'bg-amber-500',
  HOLD: 'bg-amber-500',
  REJECTED: 'bg-orange-600',
  PENDING_REVIEW: 'bg-yellow-500',
};

/**
 * One column's filter in URL/serialised form. The wire shape mirrors
 * the server's `FilterEntry` — see
 * `apps/api/src/inspections/column-filter.registry.ts`. The URL is
 * the source of truth; the grid reads it on every render and pushes
 * a new value when the user changes a filter.
 */
type WireFilter = {
  columnKey: string;
  op:
    | 'contains'
    | 'beginsWith'
    | 'endsWith'
    | 'isExactly'
    | 'oneOf'
    | 'match'
    | 'eq'
    | 'in'
    | 'gte'
    | 'lte'
    | 'between';
  value: unknown;
  value2?: unknown;
};

/**
 * Convert URL JSON → a `{ columnKey: ColumnFilterValue }` map the
 * table can consume. Unknown column keys are silently dropped; we
 * let the server reject them too (the server's parser does the same).
 */
function parseFiltersFromUrl(raw: string | null): Record<string, ColumnFilterValue> {
  if (!raw) return {};
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!Array.isArray(arr)) return {};
  const out: Record<string, ColumnFilterValue> = {};
  for (const e of arr) {
    if (!e || typeof e !== 'object') continue;
    const w = e as WireFilter;
    const col = COLUMNS.find((c) => c.key === w.columnKey);
    if (!col || !col.filterable) continue;
    const kind = col.filterable.kind;
    if (kind === 'text') {
      // The server-side filterable text columns (po / design /
      // itemDescription / type / aql / inspector / merchandiser /
      // inspectionNumber) accept contains / beginsWith / endsWith /
      // isExactly / oneOf / match. We map them all into the single
      // `contains`-shaped UI value, threading the op through.
      if (w.op === 'oneOf' && Array.isArray(w.value)) {
        const vals = (w.value as unknown[])
          .filter((v): v is string => typeof v === 'string' && v.length > 0);
        out[w.columnKey] = { kind: 'oneOf', op: 'oneOf', values: vals };
      } else if (
        (w.op === 'contains' ||
          w.op === 'beginsWith' ||
          w.op === 'endsWith' ||
          w.op === 'isExactly' ||
          w.op === 'match') &&
        typeof w.value === 'string'
      ) {
        out[w.columnKey] = { kind: 'contains', op: w.op, value: w.value };
      }
    } else if (kind === 'enum' && (w.op === 'in' || w.op === 'eq') && Array.isArray(w.value)) {
      const vals = (w.value as unknown[]).filter(
        (v): v is string => typeof v === 'string',
      );
      out[w.columnKey] = { kind: 'enum', values: vals };
    } else if (kind === 'number' && w.op === 'between') {
      out[w.columnKey] = {
        kind: 'number',
        min: w.value == null ? '' : String(w.value),
        max: w.value2 == null ? '' : String(w.value2),
      };
    } else if (kind === 'number' && (w.op === 'gte' || w.op === 'lte')) {
      out[w.columnKey] = {
        kind: 'number',
        min: w.op === 'gte' ? String(w.value) : '',
        max: w.op === 'lte' ? String(w.value) : '',
      };
    } else if (kind === 'date' && w.op === 'between') {
      out[w.columnKey] = {
        kind: 'date',
        from: typeof w.value === 'string' ? w.value : '',
        to: typeof w.value2 === 'string' ? w.value2 : '',
      };
    } else if (kind === 'date' && (w.op === 'gte' || w.op === 'lte')) {
      out[w.columnKey] = {
        kind: 'date',
        from: w.op === 'gte' && typeof w.value === 'string' ? w.value : '',
        to: w.op === 'lte' && typeof w.value === 'string' ? w.value : '',
      };
    }
  }
  return out;
}

/** Translate a `ColumnFilterValue` map → URL JSON. */
function serialiseFilters(filters: Record<string, ColumnFilterValue>): string {
  const arr: WireFilter[] = [];
  for (const [columnKey, v] of Object.entries(filters)) {
    if (isEmptyFilter(v)) continue;
    const col = COLUMNS.find((c) => c.key === columnKey);
    if (!col || !col.filterable) continue;
    if (v.kind === 'oneOf' && col.filterable.kind === 'text') {
      const list = v.values.map((s) => s.trim()).filter(Boolean);
      if (list.length === 0) continue;
      arr.push({ columnKey, op: 'oneOf', value: list });
    } else if (v.kind === 'contains' && col.filterable.kind === 'text') {
      const trimmed = v.value.trim();
      if (!trimmed) continue;
      arr.push({ columnKey, op: v.op, value: trimmed });
    } else if (v.kind === 'enum' && col.filterable.kind === 'enum') {
      if (v.values.length === 0) continue;
      arr.push({ columnKey, op: 'in', value: v.values });
    } else if (v.kind === 'number' && col.filterable.kind === 'number') {
      const min = v.min.trim();
      const max = v.max.trim();
      if (min && max) {
        arr.push({ columnKey, op: 'between', value: Number(min), value2: Number(max) });
      } else if (min) {
        arr.push({ columnKey, op: 'gte', value: Number(min) });
      } else if (max) {
        arr.push({ columnKey, op: 'lte', value: Number(max) });
      }
    } else if (v.kind === 'date' && col.filterable.kind === 'date') {
      const from = v.from;
      const to = v.to;
      if (from && to) {
        arr.push({ columnKey, op: 'between', value: from, value2: to });
      } else if (from) {
        arr.push({ columnKey, op: 'gte', value: from });
      } else if (to) {
        arr.push({ columnKey, op: 'lte', value: to });
      }
    }
  }
  return JSON.stringify(arr);
}

/**
 * Client wrapper that owns (a) the "selected inspection" state used
 * by the View Report toolbar button, (b) the user's column
 * customisations (visible / order / width) and saved views, and
 * (c) the per-column filter state.
 *
 * Per-column filters live in the URL (next to `sortBy`); the server
 * re-fetches whenever they change. The grid still owns local view
 * state in localStorage and the `inspection_views` table on the
 * server for column ordering / widths.
 */
export default function InspectionsGrid({
  rows,
  total,
}: {
  rows: Inspection[];
  total: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutState>(() => defaultLayout());
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Derive the filter map straight from the URL on every render.
  const filters = useMemo(
    () => parseFiltersFromUrl(sp.get(URL_FILTER_PARAM)),
    [sp],
  );

  // Hydrate from localStorage on mount, then overlay any saved views
  // from the server. Built-in "Default" view = "use defaults", so we
  // skip it when persisting the active-view id.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setLayout(reconcileLayout(JSON.parse(raw) as Partial<LayoutState>));
    } catch {
      /* ignore */
    }
    fetchSavedViews().then((views) => {
      setSavedViews(views);
      const def = views.find((v) => v.isBuiltIn);
      if (def) setActiveViewId(def.id);
    });
  }, []);

  // Persist layout to localStorage whenever it changes (debounced via
  // microtask — the parent re-renders are cheap enough).
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(layout));
    } catch {
      /* ignore quota errors */
    }
  }, [layout]);

  // Width changes during a column drag fire very frequently; the
  // child commits them straight to state. No debounce needed — local
  // re-renders are cheap and the server doesn't see them.
  function onWidthChange(key: string, px: number) {
    setLayout((l) => ({ ...l, widths: { ...l.widths, [key]: px } }));
  }

  /**
   * Push a new per-column filter into the URL. Replaces the entire
   * `filters` param (one URL source of truth, no merging edge cases).
   */
  const onFilterChange = useCallback(
    (columnKey: string, value: ColumnFilterValue | undefined) => {
      const next = { ...filters };
      if (value === undefined || isEmptyFilter(value)) {
        delete next[columnKey];
      } else {
        next[columnKey] = value;
      }
      const params = new URLSearchParams(sp.toString());
      const serialised = serialiseFilters(next);
      if (serialised === '[]') {
        params.delete(URL_FILTER_PARAM);
      } else {
        params.set(URL_FILTER_PARAM, serialised);
      }
      // Reset to first page on filter change so the user doesn't
      // silently land on an empty page from a previous query.
      params.delete('page');
      router.push(`/inspections?${params.toString()}`);
    },
    [filters, router, sp],
  );

  function clearAllFilters() {
    const params = new URLSearchParams(sp.toString());
    params.delete(URL_FILTER_PARAM);
    params.delete('page');
    router.push(`/inspections?${params.toString()}`);
  }

  async function onSaveAs(name: string) {
    const res = await fetch('/api/backend/inspection-views', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: '',
        layout: {
          columnOrder: layout.columnOrder,
          hiddenColumns: layout.columnOrder.filter(
            (k) => !layout.visibleKeys.includes(k),
          ),
          widths: layout.widths,
          sortBy: layout.sortBy,
          filters,
        },
      }),
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    const created = (await res.json()) as SavedView;
    setSavedViews((prev) => {
      const next = [...prev.filter((v) => v.id !== created.id), created];
      next.sort((a, b) => Number(b.isBuiltIn) - Number(a.isBuiltIn) || a.name.localeCompare(b.name));
      return next;
    });
    setActiveViewId(created.id);
  }

  async function onDeleteView(v: SavedView) {
    const res = await fetch(`/api/backend/inspection-views/${v.id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    if (!res.ok && res.status !== 204) throw new Error(`delete failed: ${res.status}`);
    setSavedViews((prev) => prev.filter((x) => x.id !== v.id));
    if (activeViewId === v.id) setActiveViewId(null);
  }

  function onLoadView(v: SavedView) {
    setLayout(reconcileLayout(v.layout));
    // Saved views can also restore filters — apply them to the URL.
    const restored = (v.layout?.filters ?? {}) as Record<string, ColumnFilterValue>;
    const params = new URLSearchParams(sp.toString());
    const serialised = serialiseFilters(restored);
    if (serialised === '[]') {
      params.delete(URL_FILTER_PARAM);
    } else {
      params.set(URL_FILTER_PARAM, serialised);
    }
    params.delete('page');
    router.push(`/inspections?${params.toString()}`);
    setActiveViewId(v.id);
  }

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );
  const canReport = !!selected;
  const columns = visibleOrderedColumns(layout);

  const activeFilterEntries = useMemo(() => {
    return Object.entries(filters).filter(([, v]) => !isEmptyFilter(v));
  }, [filters]);

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-stone-200 px-4 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!canReport}
            onClick={() => {
              if (!selected) return;
              window.open(
                `/api/backend/reports/inspections/${selected.id}/detail?regenerate=1`,
                '_blank',
                'noopener,noreferrer',
              );
            }}
            className={`px-4 py-1.5 rounded text-sm font-medium transition ${
              canReport
                ? 'bg-qc-strong hover:bg-qc-deep text-qc-on'
                : 'bg-stone-200 text-stone-500 cursor-not-allowed'
            }`}
            title={
              canReport
                ? 'Open the detail submission report for the selected inspection'
                : 'Select an inspection row to enable'
            }
          >
            View Report
          </button>
          {selected ? (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="text-xs text-stone-500 hover:text-stone-700 underline"
            >
              Clear selection
            </button>
          ) : null}
        </div>

        <div className="flex-1 min-w-0">
          {selected ? (
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <span className="font-semibold text-stone-700">
                {selected.poNumber || 'No PO'}
              </span>
              <span className="text-stone-500">·</span>
              <span className="text-stone-600 truncate max-w-[260px]">
                {selected.itemDescription || selected.itemNumber || '—'}
              </span>
              <span className="text-stone-500">·</span>
              <span className="text-stone-600">
                {selected.supplier?.name ?? 'No supplier'}
              </span>
              <span className="text-stone-500">·</span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium text-white ${RESULT_BAR[selected.overallResult]}`}
              >
                {RESULT_LABEL[selected.overallResult]}
              </span>
            </div>
          ) : (
            <span className="text-sm text-stone-500">
              Select a row below to enable report actions.
            </span>
          )}
        </div>

        <span className="text-xs text-stone-400 whitespace-nowrap">
          {total} total · showing {rows.length}
        </span>

        <ColumnCustomizer
          layout={layout}
          savedViews={savedViews}
          onLayoutChange={setLayout}
          onLoadView={onLoadView}
          onSaveAs={onSaveAs}
          onDeleteView={onDeleteView}
        />
      </div>

      {activeFilterEntries.length > 0 ? (
        <div className="bg-white border border-qc-soft rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-stone-600">
            {activeFilterEntries.length} filter
            {activeFilterEntries.length === 1 ? '' : 's'}:
          </span>
          {activeFilterEntries.map(([key, v]) => {
            const col = COLUMNS.find((c) => c.key === key);
            if (!col) return null;
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1 bg-qc-soft text-qc-deep text-xs px-2 py-0.5 rounded-full"
              >
                <span className="font-semibold">{col.label}:</span>
                <span>{summariseFilter(col, v)}</span>
                <button
                  type="button"
                  aria-label={`Clear ${col.label} filter`}
                  className="ml-1 hover:text-reject-deep"
                  onClick={() => onFilterChange(key, undefined)}
                >
                  ×
                </button>
              </span>
            );
          })}
          <button
            type="button"
            className="text-xs text-stone-500 hover:text-stone-700 underline ml-auto"
            onClick={clearAllFilters}
          >
            Clear all
          </button>
        </div>
      ) : null}

      <InspectionsTable
        rows={rows}
        total={total}
        columns={columns}
        widths={layout.widths}
        filters={filters}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onWidthChange={onWidthChange}
        onFilterChange={onFilterChange}
      />
    </div>
  );
}