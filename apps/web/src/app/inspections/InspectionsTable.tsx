'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  type Inspection,
  type ColumnDef,
  type SortKey,
  COLUMNS,
} from './columns';
import ColumnFilter, {
  type ColumnFilterValue,
  isEmptyFilter,
} from './ColumnFilter';

export type { Inspection } from './columns';

const MIN_COL_WIDTH = 60;

/**
 * Resizable, re-orderable, per-column-filterable inspections grid.
 *
 *  - `columns` controls the visible column ORDER. Widths and visibility
 *    are owned by the parent (`InspectionsGrid`) which persists them.
 *  - The header fires a server-side sort by setting `sortBy=…` on the
 *    URL; the server stays the source of truth for ordering.
 *  - Per-column drag-resize handles let the user widen/narrow columns
 *    live; the parent receives `onWidthChange(key, px)`.
 *  - Per-column filter triggers live next to each filterable column
 *    header; the parent receives `onFilterChange(key, value)` and is
 *    responsible for serialising to the URL so the server can re-fetch.
 */
export default function InspectionsTable({
  rows,
  total,
  columns,
  widths,
  filters,
  selectedId,
  onSelect,
  onWidthChange,
  onFilterChange,
}: {
  rows: Inspection[];
  total: number;
  columns: ColumnDef[]; // visible, in display order
  widths: Record<string, number>;
  filters?: Record<string, ColumnFilterValue>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onWidthChange?: (key: string, px: number) => void;
  onFilterChange?: (key: string, value: ColumnFilterValue | undefined) => void;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const sortKey: SortKey = (sp.get('sortBy') ?? 'DATE_DESC') as SortKey;

  const sorted = useMemo(() => rows, [rows]);

  function clickSort(next: SortKey) {
    let target = next;
    if (sortKey === next) {
      const [base, dir] = next.split('_');
      const flipped = `${base}_${dir === 'ASC' ? 'DESC' : 'ASC'}`;
      target = flipped;
    }
    const params = new URLSearchParams(sp.toString());
    params.set('sortBy', target);
    params.delete('page');
    router.push(`/inspections?${params.toString()}`);
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table
          className="text-sm border-separate"
          style={{ width: 'max-content', minWidth: '100%' }}
        >
          <thead className="bg-stone-100 text-left sticky top-0 z-10">
            <tr>
              {columns.map((c) => (
                <Header
                  key={c.key}
                  col={c}
                  width={widths[c.key] ?? c.defaultWidth}
                  sortKey={sortKey}
                  filter={filters?.[c.key]}
                  onSort={clickSort}
                  onWidthChange={onWidthChange}
                  onFilterChange={onFilterChange}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((i) => {
              const isSelected = selectedId === i.id;
              return (
                <tr
                  key={i.id}
                  className={`border-t hover:bg-stone-50 ${isSelected ? 'bg-qc-soft' : ''}`}
                >
                  {columns.map((c) => {
                    if (c.key === 'select') {
                      return (
                        <td
                          key={c.key}
                          style={{ width: widths[c.key] ?? c.defaultWidth }}
                          className="p-3"
                        >
                          <input
                            type="radio"
                            name="inspection-select"
                            aria-label={`Select inspection ${i.poNumber || i.id}`}
                            checked={isSelected}
                            onChange={() => onSelect?.(i.id)}
                            className="h-4 w-4 cursor-pointer accent-qc-deep"
                          />
                        </td>
                      );
                    }
                    return (
                      <td
                        key={c.key}
                        style={{
                          width: widths[c.key] ?? c.defaultWidth,
                          textAlign: c.align ?? 'left',
                        }}
                        className={`p-3 ${c.align === 'right' ? 'text-right' : ''}`}
                      >
                        {c.render(i)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="p-3 text-sm text-stone-500 border-t bg-stone-50 flex items-center justify-between">
        <span>
          Showing {sorted.length} of {total}
        </span>
        <span className="text-xs text-stone-400">
          Click column headers to change sort · drag column edges to resize
        </span>
      </div>
    </div>
  );
}

function Header({
  col,
  width,
  sortKey,
  filter,
  onSort,
  onWidthChange,
  onFilterChange,
}: {
  col: ColumnDef;
  width: number;
  sortKey: SortKey;
  filter?: ColumnFilterValue;
  onSort: (k: SortKey) => void;
  onWidthChange?: (key: string, px: number) => void;
  onFilterChange?: (key: string, value: ColumnFilterValue | undefined) => void;
}) {
  const isActive = !!col.sortValue && sortKey === col.sortValue;
  const arrow =
    col.sortValue && isActive ? (sortKey.endsWith('_ASC') ? '↑' : '↓') : '';
  const base =
    'font-semibold text-stone-700 inline-flex items-center gap-1 hover:text-qc-deep';

  // Render the cell label — sortable columns become buttons that
  // trigger a server-side sort; non-sortable columns are plain text.
  const inner = col.sortable && col.sortValue ? (
    <button type="button" onClick={() => onSort(col.sortValue!)} className={base}>
      {col.label}
      <span className={isActive ? 'text-qc-deep' : 'text-stone-300'}>
        {arrow || '↕'}
      </span>
    </button>
  ) : (
    <span className="font-semibold text-stone-700">{col.label}</span>
  );

  const hasFilter = !isEmptyFilter(filter);

  return (
    <th
      className={`p-3 relative ${col.align === 'right' ? 'text-right' : ''} ${
        hasFilter ? 'bg-qc-soft' : ''
      }`}
      style={{ width }}
    >
      <span className={`inline-flex items-center ${col.align === 'right' ? 'flex-row-reverse' : ''}`}>
        {inner}
        {col.filterable && onFilterChange ? (
          <ColumnFilter
            column={col}
            initial={filter}
            onApply={(v) => onFilterChange(col.key, v)}
            onClear={() => onFilterChange(col.key, undefined)}
          />
        ) : null}
      </span>
      {!col.required && onWidthChange ? (
        <ResizeHandle columnKey={col.key} width={width} minWidth={col.minWidth ?? MIN_COL_WIDTH} onWidthChange={onWidthChange} />
      ) : null}
    </th>
  );
}

/**
 * Thin vertical drag handle on the right edge of a resizable column
 * header. Click and drag horizontally to widen / narrow the column.
 *
 * The handle captures pointer events (`setPointerCapture`) so the
 * gesture stays attached even if the cursor leaves the header cell
 * during the drag. Width changes are committed to the parent on
 * `pointerup`; intermediate `pointermove` events update a CSS
 * variable so the column visually tracks without re-rendering every
 * row on every frame.
 */
function ResizeHandle({
  columnKey,
  width,
  minWidth,
  onWidthChange,
}: {
  columnKey: string;
  width: number;
  minWidth: number;
  onWidthChange: (key: string, px: number) => void;
}) {
  const startX = useRef(0);
  const startW = useRef(0);
  const dragging = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragging.current = true;
      startX.current = e.clientX;
      startW.current = width;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [width],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const next = Math.max(minWidth, startW.current + (e.clientX - startX.current));
      // Live-update only the header width via a CSS variable to keep
      // the gesture smooth; we don't re-render the body on every frame.
      const th = (e.target as HTMLElement).closest('th') as HTMLElement | null;
      if (th) th.style.width = `${next}px`;
      // Commit to state at the end of the gesture (see pointerup).
      // For live tracking we also call onWidthChange throttled via rAF.
      if (handleRef.current?.dataset.dirty !== '1') {
        handleRef.current!.dataset.dirty = '1';
        requestAnimationFrame(() => {
          handleRef.current!.dataset.dirty = '0';
          onWidthChange(columnKey, next);
        });
      }
    },
    [columnKey, minWidth, onWidthChange],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      const final = Math.max(
        minWidth,
        startW.current + (e.clientX - startX.current),
      );
      onWidthChange(columnKey, final);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [columnKey, minWidth, onWidthChange],
  );

  const handleRef = useRef<HTMLDivElement | null>(null);

  // Cancel an in-flight drag on unmount.
  useEffect(
    () => () => {
      dragging.current = false;
    },
    [],
  );

  return (
    <div
      ref={handleRef}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${columnKey} column`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none hover:bg-qc-300/60"
      data-testid={`resize-${columnKey}`}
    />
  );
}

// Re-export so callers can build the full default column list without
// importing from `columns` directly (back-compat with the previous
// `InspectionsTable` callers that imported `Inspection`).
export const DEFAULT_COLUMNS = COLUMNS;