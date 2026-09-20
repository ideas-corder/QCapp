/**
 * KpiTile — single KPI card for the executive dashboard. Shows a label,
 * a big numeric value, an optional trend pill (delta with up/down
 * arrow + %), and an optional sparkline at the bottom. Use the
 * `accent` prop to give the card a coloured top stripe (matching the
 * legend colour of the related chart).
 */
import * as React from 'react';
import SparkLine from './SparkLine';

type Props = {
  label: string;
  value: string | number;
  /** Optional secondary unit, e.g. "%". */
  unit?: string;
  /** Optional sub-label below the value. */
  hint?: string;
  /** Sparkline series. Last point should be the most recent. */
  series?: number[];
  /** Stroke colour for the sparkline. */
  seriesColor?: string;
  /** 0–100 delta percentage vs the previous period. Pass `null` (or
   *  omit) to hide the trend pill when the prior-period baseline is
   *  too small to be statistically meaningful. */
  deltaPct?: number | null;
  /** "up is good" when true (e.g. pass rate). When false, an upward
   *  delta is bad (e.g. failures). */
  upIsGood?: boolean;
  /** Top stripe colour. If omitted, no stripe. */
  accent?: string;
  className?: string;
};

export default function KpiTile({
  label,
  value,
  unit,
  hint,
  series,
  seriesColor,
  deltaPct,
  upIsGood = true,
  accent,
  className = '',
}: Props) {
  let deltaColour = 'text-stone-500';
  let arrow = '';
  let showDelta = false;
  if (typeof deltaPct === 'number' && Number.isFinite(deltaPct)) {
    const isUp = deltaPct > 0;
    const isFlat = deltaPct === 0;
    arrow = isFlat ? '→' : isUp ? '↑' : '↓';
    const good = isFlat ? true : isUp === upIsGood;
    deltaColour = isFlat
      ? 'text-stone-500'
      : good
      ? 'text-accept-deep'
      : 'text-reject-deep';
    showDelta = true;
  }
  return (
    <div
      className={`relative bg-white rounded-lg border border-stone-200 px-4 pt-4 pb-3 overflow-hidden ${className}`}
    >
      {accent && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1"
          style={{ backgroundColor: accent }}
        />
      )}
      <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[28px] leading-none font-bold text-stone-900 tabular-nums">
          {value}
        </span>
        {unit && (
          <span className="text-stone-400 text-sm font-medium">{unit}</span>
        )}
        {showDelta && (
          <span className={`ml-auto text-xs font-semibold ${deltaColour}`}>
            {arrow} {Math.abs(deltaPct ?? 0)}%
          </span>
        )}
      </div>
      {hint && (
        <div className="text-xs text-stone-400 mt-1">{hint}</div>
      )}
      {series && series.length > 0 && (
        <div className="mt-3 -mx-1">
          <SparkLine values={series} stroke={seriesColor} />
        </div>
      )}
    </div>
  );
}