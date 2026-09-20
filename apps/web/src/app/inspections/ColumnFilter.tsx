'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type ColumnDef,
  type ColumnFilterSpec,
  type TextFilterOp,
  TEXT_FILTER_OPS,
} from './columns';

/**
 * Wire shape of one column's current filter (the union of every
 * supported UI state). Round-trippable: serialise to the same JSON
 * the server expects, and back into this object for editing.
 *
 * Text filters carry an `op` so the user can switch between
 * `contains` / `beginsWith` / `endsWith` / `isExactly` / `oneOf` /
 * `match`. The wire shape mirrors the server-side `FilterOp`.
 */
export type ColumnFilterValue =
  | { kind: 'contains'; op: TextFilterOp; value: string }
  | { kind: 'oneOf'; op: 'oneOf'; values: string[] }
  | { kind: 'enum'; values: string[] }
  | { kind: 'number'; min: string; max: string }
  | { kind: 'date'; from: string; to: string };

/**
 * Stable empty state per filter type — used when opening the
 * popover for a column that has no active filter yet.
 */
function emptyFor(spec: ColumnFilterSpec): ColumnFilterValue {
  switch (spec.kind) {
    case 'text':
      return {
        kind: 'contains',
        op: spec.defaultOp ?? 'contains',
        value: '',
      };
    case 'enum':
      return { kind: 'enum', values: [] };
    case 'number':
      return { kind: 'number', min: '', max: '' };
    case 'date':
      return { kind: 'date', from: '', to: '' };
  }
}

/**
 * True when `v` represents "no filter" for its kind — empty string,
 * empty array, or both bounds blank.
 */
export function isEmptyFilter(v: ColumnFilterValue | undefined): boolean {
  if (!v) return true;
  switch (v.kind) {
    case 'contains':
      return !v.value.trim();
    case 'oneOf':
      return v.values.length === 0;
    case 'enum':
      return v.values.length === 0;
    case 'number':
      return !v.min && !v.max;
    case 'date':
      return !v.from && !v.to;
  }
}

/**
 * Compact label used in the "Active filters" chips on the toolbar.
 * One short line per column, e.g. `Result ∈ PASS, FAIL`.
 */
export function summariseFilter(
  col: ColumnDef,
  v: ColumnFilterValue,
): string {
  switch (v.kind) {
    case 'contains': {
      const opLabel = TEXT_FILTER_OPS.find((o) => o.value === v.op)?.label ?? v.op;
      return `${opLabel.toLowerCase()} "${v.value.trim()}"`;
    }
    case 'oneOf': {
      return `one of "${v.values.join(', ')}"`;
    }
    case 'enum': {
      const labels = (col.filterable?.kind === 'enum' && col.filterable.enumLabels) || {};
      const shown = v.values
        .map((x) => labels[x] ?? x)
        .join(', ');
      return `∈ ${shown}`;
    }
    case 'number': {
      if (v.min && v.max) return `${v.min} – ${v.max}`;
      if (v.min) return `≥ ${v.min}`;
      if (v.max) return `≤ ${v.max}`;
      return '';
    }
    case 'date': {
      if (v.from && v.to) return `${v.from} → ${v.to}`;
      if (v.from) return `from ${v.from}`;
      if (v.to) return `to ${v.to}`;
      return '';
    }
  }
}

/**
 * Per-column filter popover. Mounted next to each column header that
 * declares a `filterable` spec; commits `onApply(value` on every
 * change so the parent can push the URL param without waiting for a
 * submit click. Apply is implicit — there's also an explicit "Apply"
 * button for the date / number widgets where the user types a value
 * and confirms it.
 */
export default function ColumnFilter({
  column,
  initial,
  onApply,
  onClear,
}: {
  column: ColumnDef;
  initial: ColumnFilterValue | undefined;
  onApply: (v: ColumnFilterValue) => void;
  onClear: () => void;
}) {
  const [value, setValue] = useState<ColumnFilterValue>(
    () => initial ?? emptyFor(column.filterable!),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  /**
   * Popover position, expressed in viewport coordinates (used with
   * `position: fixed` via React portal).
   *
   * Why a portal (root-cause of "filter popover is cut off" report):
   *
   *   The column header lives inside a sticky `<thead>` which sits inside
   *   `<div className="overflow-x-auto">` which sits inside
   *   `<div className="overflow-hidden">` — the outer card's rounded
   *   border. With the popover rendered inline (the previous
   *   `absolute right-0 top-full` approach), it became a child of the
   *   scroll container, so:
   *
   *     - The outer `overflow-hidden` clipped it at the card edge.
   *       For the leftmost pinned columns (Doc No, Date, etc.) the
   *       popover tried to extend *left* past the trigger and got cut
   *       by the card's left border.
   *     - The `overflow-x-auto` clipping context broke vertical
   *       overflow too (overflow-x implies overflow-y in most cases
   *       once scrollbars kick in), so the popover also got cut at
   *       the bottom of the visible viewport.
   *
   *   Portaling to `document.body` with `position: fixed` puts the
   *   popover outside ALL clipping ancestors and uses viewport
   *   coordinates directly. The only remaining constraint is the
   *   viewport itself, which we clamp against below.
   */
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  // Recompute the popover's fixed position on open and on every viewport
  // resize. We measure the trigger with getBoundingClientRect() (viewport
  // coords) so the popover anchors to its real screen position even when
  // the table has been scrolled horizontally.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    function place() {
      const t = triggerRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      const popW = popoverRef.current?.offsetWidth ?? 260;
      const vw = window.innerWidth;
      // Default: align the popover's right edge with the trigger's right
      // edge so it extends leftward (matches the old `right-0` behaviour
      // for columns that have room to the left). Then clamp so it never
      // spills past the left viewport edge.
      let left = r.right - popW;
      if (left < 8) left = 8;
      if (left + popW > vw - 8) left = vw - 8 - popW;
      // 8px gap below the trigger, just like the old `mt-1`.
      setPos({ left, top: r.bottom + 8, width: popW });
    }
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      // Inside-trigger clicks: keep open. Popover clicks: handled by
      // `onClick` stopPropagation on the popover itself. Everything
      // else: close.
      //
      // Why `pointerdown` (not `mousedown` or `click`):
      //   - Fires earlier than `click`, so the close happens before
      //     React re-renders the popover out from under the click target.
      //   - Unifies mouse + touch + pen in modern browsers.
      //   - Crucially, does NOT fire on focus-only events like
      //     `scrollIntoView`, so the popover stays open when the
      //     browser auto-scrolls a focused input into view.
      const t = e.target as Node | null;
      if (!t) return;
      if (rootRef.current && rootRef.current.contains(t)) return;
      if (popoverRef.current && popoverRef.current.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const spec = column.filterable!;
  const hasActive = !isEmptyFilter(initial);

  // SSR safety: only render the portal client-side. `document` doesn't
  // exist on the server during Next.js prerender.
  const isClient = typeof document !== 'undefined';

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Filter ${column.label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`ml-1 inline-flex items-center justify-center h-5 w-5 text-xs ${
          hasActive
            ? 'text-qc-deep bg-qc-soft rounded'
            : 'text-stone-300 hover:text-stone-500'
        }`}
        title={hasActive ? 'Filter active — click to edit' : 'Filter column'}
      >
        {/* Down-arrow into a funnel. SVG keeps it crisp at any size. */}
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M1.5 2h13l-5 6.5V14l-3-1.5V8.5L1.5 2z"
          />
        </svg>
      </button>
      {open && isClient && pos
        ? createPortal(
            <div
              ref={popoverRef}
              role="dialog"
              aria-label={`Filter ${column.label}`}
              style={{
                position: 'fixed',
                left: pos.left,
                top: pos.top,
                zIndex: 50,
              }}
              className="bg-white border border-stone-200 rounded-lg shadow-lg p-3 min-w-[260px]"
              onClick={(e) => e.stopPropagation()}
            >
          {spec.kind === 'text' ? (
            value.kind === 'oneOf' ? (
              <TextOneOfFilter
                values={value.values}
                placeholder={spec.placeholder ?? 'contains…'}
                onChange={(vals) => {
                  const next: ColumnFilterValue = { kind: 'oneOf', op: 'oneOf', values: vals };
                  setValue(next);
                  onApply(next);
                  // No auto-close: a oneOf chip list is a multi-select
                  // — closing after the first chip would force the user
                  // to re-open the popover every time they want to add
                  // another value. User dismisses via click outside,
                  // Escape, or Clear.
                }}
                onClear={onClear}
              />
            ) : (
              <TextFilter
                value={
                  value.kind === 'contains'
                    ? { op: value.op, value: value.value }
                    : { op: spec.defaultOp ?? 'contains', value: '' }
                }
                placeholder={spec.placeholder ?? 'contains…'}
                onChange={(next) => {
                  const v: ColumnFilterValue = { kind: 'contains', ...next };
                  setValue(v);
                  onApply(v);
                  // No auto-close: the user may want to switch the
                  // operator (contains / begins / ends / exactly /
                  // match) or refine their text before closing.
                  // Dismissal happens via Enter / Apply button /
                  // click outside / Escape / Clear.
                }}
                onSwitchToOneOf={(seed) => {
                  const next: ColumnFilterValue = {
                    kind: 'oneOf',
                    op: 'oneOf',
                    values: seed,
                  };
                  setValue(next);
                  onApply(next);
                  // No auto-close for the same reason as onChange above.
                }}
                onApply={(next) => {
                  // Sync the latest typed value into the parent one more
                  // time (in case the user hit Enter / Apply without an
                  // intervening onChange firing) then close the popover.
                  const v: ColumnFilterValue = { kind: 'contains', ...next };
                  setValue(v);
                  onApply(v);
                  setOpen(false);
                }}
                onClear={onClear}
              />
            )
          ) : null}

          {spec.kind === 'enum' ? (
            <EnumFilter
              values={spec.enumValues}
              labels={spec.enumLabels}
              selected={value.kind === 'enum' ? value.values : []}
              onChange={(vals) => {
                const next: ColumnFilterValue = { kind: 'enum', values: vals };
                setValue(next);
                onApply(next);
                // No auto-close: enum chips are a multi-select — the
                // user expects to click multiple chips in a row.
                // User dismisses via click outside, Escape, or Clear.
              }}
              onClear={onClear}
            />
          ) : null}

          {spec.kind === 'number' ? (
            <NumberFilter
              min={value.kind === 'number' ? value.min : ''}
              max={value.kind === 'number' ? value.max : ''}
              step={spec.step ?? 1}
              onApply={(min, max) => {
                const next: ColumnFilterValue = { kind: 'number', min, max };
                setValue(next);
                onApply(next);
                // Close after explicit Apply so the user can see the
                // filtered rows immediately.
                setOpen(false);
              }}
              onClear={onClear}
            />
          ) : null}

          {spec.kind === 'date' ? (
            <DateFilter
              from={value.kind === 'date' ? value.from : ''}
              to={value.kind === 'date' ? value.to : ''}
              onApply={(from, to) => {
                const next: ColumnFilterValue = { kind: 'date', from, to };
                setValue(next);
                onApply(next);
                setOpen(false);
              }}
              onClear={onClear}
            />
          ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * Text filter — operator dropdown + a single-line input. When the
 * user picks `oneOf`, control hands off to `TextOneOfFilter` (chip
 * list). `match` keeps the single input but adds a live regex
 * validity hint so the URL doesn't get pushed with a malformed
 * pattern that the server would silently drop.
 */
function TextFilter({
  value,
  placeholder,
  onChange,
  onSwitchToOneOf,
  onApply,
  onClear,
}: {
  value: { op: TextFilterOp; value: string };
  placeholder: string;
  onChange: (next: { op: TextFilterOp; value: string }) => void;
  onSwitchToOneOf: (seed: string[]) => void;
  /**
   * Commit the current typed value, push the URL param, and close the
   * popover. Bound to BOTH the Enter key on the input and the explicit
   * Apply button at the bottom of the widget. Without this callback the
   * single-value text filter had no apply signal (the previous auto-close
   * on first keystroke was removed because it was too aggressive for
   * multi-select use cases, leaving the "Enter to apply" hint as a lie).
   *
   * The callback receives the current operator + value so the parent
   * doesn't have to re-derive them from its own (union-typed) state —
   * this avoids a type-narrowing bug where `value.op` doesn't exist on
   * the `enum/number/date` arms of the union.
   */
  onApply: (next: { op: TextFilterOp; value: string }) => void;
  onClear: () => void;
}) {
  const applyCurrent = () => onApply({ op: value.op, value: value.value });
  function commitOp(next: TextFilterOp) {
    if (next === 'oneOf') {
      // Hand off to the chip-list component, seeding it with whatever
      // the user had typed so an active "contains PO-DE" filter
      // becomes "oneOf PO-DE" without losing state.
      const seeded = value.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      onSwitchToOneOf(seeded);
    } else {
      onChange({ op: next, value: value.value });
    }
  }

  const opMeta = TEXT_FILTER_OPS.find((o) => o.value === value.op);
  const canApply = value.value.trim().length > 0;

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-xs text-stone-500 mb-0.5">Operator</span>
        <select
          value={value.op}
          onChange={(e) => commitOp(e.target.value as TextFilterOp)}
          className="w-full border border-stone-300 rounded px-2 py-1 text-sm bg-white"
        >
          {TEXT_FILTER_OPS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {opMeta?.hint ? (
          <span className="block text-[10px] text-stone-400 mt-0.5">
            {opMeta.hint}
          </span>
        ) : null}
      </label>

      <label className="block">
        <span className="block text-xs text-stone-500 mb-0.5">Value</span>
        <input
          autoFocus
          type="text"
          value={value.value}
          onChange={(e) => onChange({ op: value.op, value: e.target.value })}
          onKeyDown={(e) => {
            // Enter commits the typed value and dismisses the popover
            // — matches the NumberFilter / DateFilter Apply behaviour
            // and matches user expectation from the hint text below.
            // We commit unconditionally on Enter (even if the trimmed
            // value is empty) so the user can clear + Enter to wipe the
            // filter quickly; onClear is the dedicated Clear path.
            if (e.key === 'Enter') {
              e.preventDefault();
              applyCurrent();
            }
          }}
          placeholder={value.op === 'match' ? 'regex pattern' : placeholder}
          className="w-full border border-stone-300 rounded px-2 py-1 text-sm"
        />
        {value.op === 'match' ? (
          <PatternValidHint pattern={value.value} />
        ) : null}
      </label>

      <div className="flex justify-between items-center text-xs pt-1">
        <button
          type="button"
          className="text-stone-500 hover:text-stone-700 underline"
          onClick={onClear}
        >
          Clear
        </button>
        <button
          type="button"
          // Disabled when the trimmed input is empty so a stray click
          // can't push `value=` into the URL (which the server would
          // silently drop anyway). Enter is still allowed unconditionally
          // above for the "clear via Enter on empty input" shortcut.
          disabled={!canApply}
          onClick={applyCurrent}
          className={`px-2 py-0.5 rounded text-qc-on ${
            canApply
              ? 'bg-qc-strong hover:opacity-90'
              : 'bg-stone-300 cursor-not-allowed'
          }`}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

/**
 * Chip-list editor for the `oneOf` text operator. The user types
 * a value, hits Enter / comma to add a chip, and Backspace at an
 * empty input removes the right-most chip. Each add/remove commits
 * the full list back up via `onChange`.
 */
function TextOneOfFilter({
  values,
  placeholder,
  onChange,
  onClear,
}: {
  values: string[];
  placeholder: string;
  onChange: (vals: string[]) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const v = draft.trim();
    if (!v) return;
    if (values.includes(v)) {
      setDraft('');
      return;
    }
    onChange([...values, v]);
    setDraft('');
  }

  function remove(c: string) {
    onChange(values.filter((x) => x !== c));
  }

  return (
    <div className="space-y-2">
      <span className="block text-xs text-stone-500 mb-0.5">
        Operator: is one of
      </span>
      <div className="flex flex-wrap gap-1 mb-1 min-h-[24px]">
        {values.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 bg-qc-soft text-qc-deep text-xs px-2 py-0.5 rounded-full"
          >
            {c}
            <button
              type="button"
              aria-label={`Remove ${c}`}
              className="hover:text-reject-deep"
              onClick={() => remove(c)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
            remove(values[values.length - 1]);
          }
        }}
        placeholder={placeholder ?? 'type a value, Enter to add'}
        className="w-full border border-stone-300 rounded px-2 py-1 text-sm"
      />
      <div className="flex justify-between text-xs">
        <button
          type="button"
          className="text-stone-500 hover:text-stone-700 underline"
          onClick={onClear}
        >
          Clear
        </button>
        <span className="text-stone-400">{values.length} added</span>
      </div>
    </div>
  );
}

/**
 * Live-validate a user-entered regex pattern so the URL doesn't get
 * pushed with a syntactically broken `match` filter that the server
 * would silently drop.
 */
function PatternValidHint({ pattern }: { pattern: string }) {
  if (!pattern.trim()) return null;
  let ok = true;
  try {
    new RegExp(pattern);
  } catch {
    ok = false;
  }
  if (ok) return null;
  return (
    <span className="block text-[10px] text-reject-deep mt-0.5">
      Invalid regex — filter will be ignored
    </span>
  );
}

function EnumFilter({
  values,
  labels,
  selected,
  onChange,
  onClear,
}: {
  values: readonly string[];
  labels?: Record<string, string>;
  selected: string[];
  onChange: (vals: string[]) => void;
  onClear: () => void;
}) {
  function toggle(v: string) {
    const set = new Set(selected);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    onChange(Array.from(set));
  }
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-stone-500 mb-1">Pick one or more</div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => {
          const active = selected.includes(v);
          return (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              className={`px-2 py-0.5 rounded-full text-xs border ${
                active
                  ? 'bg-qc-deep text-qc-on border-qc-deep'
                  : 'bg-white text-stone-700 border-stone-300 hover:border-qc-deep'
              }`}
            >
              {labels?.[v] ?? v}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-xs pt-1">
        <button
          type="button"
          className="text-stone-500 hover:text-stone-700 underline"
          onClick={onClear}
        >
          Clear
        </button>
        <span className="text-stone-400">{selected.length} selected</span>
      </div>
    </div>
  );
}

function NumberFilter({
  min,
  max,
  step,
  onApply,
  onClear,
}: {
  min: string;
  max: string;
  step: number;
  onApply: (min: string, max: string) => void;
  onClear: () => void;
}) {
  const [localMin, setLocalMin] = useState(min);
  const [localMax, setLocalMax] = useState(max);
  // Resync when the parent resets externally (e.g. another widget).
  useEffect(() => setLocalMin(min), [min]);
  useEffect(() => setLocalMax(max), [max]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="flex-1">
          <span className="block text-xs text-stone-500 mb-0.5">Min</span>
          <input
            type="number"
            value={localMin}
            step={step}
            onChange={(e) => setLocalMin(e.target.value)}
            className="w-full border border-stone-300 rounded px-2 py-1 text-sm"
          />
        </label>
        <label className="flex-1">
          <span className="block text-xs text-stone-500 mb-0.5">Max</span>
          <input
            type="number"
            value={localMax}
            step={step}
            onChange={(e) => setLocalMax(e.target.value)}
            className="w-full border border-stone-300 rounded px-2 py-1 text-sm"
          />
        </label>
      </div>
      <div className="flex justify-between text-xs pt-1">
        <button
          type="button"
          className="text-stone-500 hover:text-stone-700 underline"
          onClick={onClear}
        >
          Clear
        </button>
        <button
          type="button"
          className="px-2 py-0.5 rounded bg-qc-strong text-qc-on"
          onClick={() => onApply(localMin, localMax)}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

function DateFilter({
  from,
  to,
  onApply,
  onClear,
}: {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  onClear: () => void;
}) {
  const [localFrom, setLocalFrom] = useState(from);
  const [localTo, setLocalTo] = useState(to);
  useEffect(() => setLocalFrom(from), [from]);
  useEffect(() => setLocalTo(to), [to]);
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-xs text-stone-500 mb-0.5">From</span>
        <input
          type="date"
          value={localFrom}
          onChange={(e) => setLocalFrom(e.target.value)}
          className="w-full border border-stone-300 rounded px-2 py-1 text-sm"
        />
      </label>
      <label className="block">
        <span className="block text-xs text-stone-500 mb-0.5">To</span>
        <input
          type="date"
          value={localTo}
          onChange={(e) => setLocalTo(e.target.value)}
          className="w-full border border-stone-300 rounded px-2 py-1 text-sm"
        />
      </label>
      <div className="flex justify-between text-xs pt-1">
        <button
          type="button"
          className="text-stone-500 hover:text-stone-700 underline"
          onClick={onClear}
        >
          Clear
        </button>
        <button
          type="button"
          className="px-2 py-0.5 rounded bg-qc-strong text-qc-on"
          onClick={() => onApply(localFrom, localTo)}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
