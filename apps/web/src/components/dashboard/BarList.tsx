/**
 * BarList — vertical-bar list with a single bar per row, used for
 * leaderboard ranking (supplier, inspector, defect keyword). Each row
 * shows: rank • label • horizontal bar (length = relative % of max) •
 * numeric value at the end. Server-renderable; no client JS needed.
 */
import * as React from 'react';

export type BarListRow = {
  key: string;
  label: string;
  subLabel?: string;
  value: number;
  /** Display value formatted for the right column. Defaults to value.toString(). */
  display?: string;
  /** Optional Tailwind text colour class for the value (e.g. 'text-accept-deep'). */
  valueClass?: string;
  /** Bar fill colour. Defaults to brand. */
  color?: string;
};

type Props = {
  rows: BarListRow[];
  /** Maximum bar width in px. Default 220. */
  barWidth?: number;
  className?: string;
};

export default function BarList({ rows, barWidth = 220, className = '' }: Props) {
  if (rows.length === 0) {
    return <div className={`text-stone-400 text-sm ${className}`}>No data yet</div>;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol className={`space-y-1.5 ${className}`}>
      {rows.map((r, i) => {
        const pct = r.value / max;
        const w = Math.max(2, Math.round(pct * barWidth));
        return (
          <li
            key={r.key}
            className="grid grid-cols-[24px_1fr_auto] items-center gap-3 text-sm"
          >
            <span className="text-stone-400 tabular-nums text-xs text-right font-mono">
              {i + 1}
            </span>
            <div className="min-w-0 flex items-center gap-2">
              <span className="truncate text-stone-700" title={r.label}>
                {r.label}
              </span>
              {r.subLabel && (
                <span className="text-stone-400 text-xs truncate">
                  {r.subLabel}
                </span>
              )}
              <span
                className="inline-block h-1.5 rounded-full shrink-0"
                style={{
                  width: w,
                  backgroundColor: r.color ?? 'rgb(var(--brand))',
                }}
              />
            </div>
            <span
              className={`font-mono tabular-nums text-right ${r.valueClass ?? 'text-stone-900'}`}
            >
              {r.display ?? r.value}
            </span>
          </li>
        );
      })}
    </ol>
  );
}