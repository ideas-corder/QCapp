/**
 * LeaderboardTable — ranking table for supplier / inspector performance.
 * Renders the rank, the entity name (with optional sub-label), a pass
 * rate badge, an inline progress bar coloured to match the pass-rate
 * tier, and the total inspection count on the right. Used by both B.
 * Vendor Performance and C. Business Analytics Workbench pages.
 */
import * as React from 'react';
import PassRateBadge from './PassRateBadge';

export type LeaderboardEntry = {
  key: string;
  name: string;
  sub?: string;
  total: number;
  passed: number;
  passRate: number;
  /** Optional right-side metadata (e.g. "Last seen 2 days ago"). */
  meta?: string;
};

type Props = {
  entries: LeaderboardEntry[];
  /** Optional subtitle shown above the table. */
  caption?: string;
  /** Title for the "name" column header. Default "Supplier". */
  nameLabel?: string;
  /** Title for the "pass rate" column header. Default "Pass rate". */
  passRateLabel?: string;
  className?: string;
};

export default function LeaderboardTable({
  entries,
  caption,
  nameLabel = 'Supplier',
  passRateLabel = 'Pass rate',
  className = '',
}: Props) {
  if (entries.length === 0) {
    return (
      <div className={`text-stone-400 text-sm ${className}`}>
        No suppliers have inspections yet.
      </div>
    );
  }
  return (
    <div className={className}>
      {caption && (
        <div className="text-xs text-stone-500 mb-2">{caption}</div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-stone-500 text-[11px] font-semibold uppercase tracking-wider border-b border-stone-200">
            <th className="py-2 w-8">#</th>
            <th className="py-2">{nameLabel}</th>
            <th className="py-2 text-right w-28">Inspections</th>
            <th className="py-2 text-right w-44">{passRateLabel}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr
              key={e.key}
              className="border-b border-stone-100 last:border-0 hover:bg-stone-50 transition-colors"
            >
              <td className="py-2.5 align-middle text-stone-400 font-mono text-xs">
                {i + 1}
              </td>
              <td className="py-2.5 align-middle">
                <div className="text-stone-900 font-medium truncate max-w-[260px]">
                  {e.name}
                </div>
                {e.sub && (
                  <div className="text-xs text-stone-500 truncate max-w-[260px]">
                    {e.sub}
                  </div>
                )}
                {e.meta && (
                  <div className="text-[11px] text-stone-400 mt-0.5">
                    {e.meta}
                  </div>
                )}
              </td>
              <td className="py-2.5 align-middle text-right">
                <div className="text-stone-900 font-mono tabular-nums">
                  {e.total}
                </div>
                <div className="text-[11px] text-stone-500">
                  {e.passed} passed
                </div>
              </td>
              <td className="py-2.5 align-middle text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="flex-1 max-w-[80px] h-1.5 rounded-full bg-stone-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, e.passRate)}%`,
                        backgroundColor:
                          e.passRate >= 90
                            ? 'rgb(var(--accept))'
                            : e.passRate >= 75
                            ? 'rgb(var(--brand))'
                            : e.passRate >= 50
                            ? '#f59e0b'
                            : 'rgb(var(--reject))',
                      }}
                    />
                  </div>
                  <PassRateBadge pct={e.passRate} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}