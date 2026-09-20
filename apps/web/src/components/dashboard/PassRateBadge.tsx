/**
 * PassRateBadge — small pill that shows a pass rate as a coloured bar
 * + percent. Colour rule:
 *   >= 90 %  ->  green / accept
 *   >= 75 %  ->  brand (informational)
 *   >= 50 %  ->  amber / rework
 *   <  50 %  ->  red / reject
 * Used in leaderboards to make quality-tier scanning instant.
 */
import * as React from 'react';

type Props = {
  pct: number;
  className?: string;
};

export default function PassRateBadge({ pct, className = '' }: Props) {
  let tier: 'green' | 'brand' | 'amber' | 'red';
  if (pct >= 90) tier = 'green';
  else if (pct >= 75) tier = 'brand';
  else if (pct >= 50) tier = 'amber';
  else tier = 'red';

  const styles = {
    green: 'bg-accept-soft text-accept-deep border-accept-border',
    brand: 'bg-qc-soft text-qc-deep border-qc-border',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    red: 'bg-reject-soft text-reject-deep border-reject-border',
  }[tier];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold tabular-nums ${styles} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          tier === 'green'
            ? 'bg-accept'
            : tier === 'brand'
            ? 'bg-qc'
            : tier === 'amber'
            ? 'bg-amber-500'
            : 'bg-reject'
        }`}
      />
      {pct}%
    </span>
  );
}