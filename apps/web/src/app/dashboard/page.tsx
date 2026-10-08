/**
 * A. Executive Dashboard — high-level overview for admins.
 *
 * Layout (mobile-first, expands to 3-up on lg):
 *   row 1   greeting + "snapshot at HH:MM"
 *   row 2   4 KPI tiles (Total / Pass rate / Failures / Defects) with sparklines
 *   row 3   6 smaller KPI tiles (each result class) — same row, denser
 *   row 4   status-mix donut + recent failures table
 *   row 5   category mix (donut) + supplier mix (donut)
 *
 * All charts are inline SVG, server-rendered. The page itself is a
 * server component (RSC); the API call happens in `fetchDashboardStats`
 * using the caller's cookie.
 */
import Link from 'next/link';
import {
  fetchDashboardStats,
} from '@/components/dashboard/fetchDashboard';
import KpiTile from '@/components/dashboard/KpiTile';
import Panel from '@/components/dashboard/Panel';
import DonutChart, { DonutSlice } from '@/components/dashboard/DonutChart';
import BarList, { BarListRow } from '@/components/dashboard/BarList';
import { fmtDateTime, fmtRelative } from '@/components/dashboard/format';

export const dynamic = 'force-dynamic';

export default async function ExecutiveDashboard() {
  const result = await fetchDashboardStats();
  if (!result.ok) {
    return <ErrorState error={result.error} />;
  }
  const stats = result.stats;

  // ── status-mix donut ──
  const statusSlices: DonutSlice[] = [
    { label: 'Passed', value: stats.totalPassed, color: 'rgb(var(--accept))' },
    { label: 'Failed', value: stats.totalFailed, color: 'rgb(var(--reject))' },
    { label: 'Rework', value: stats.totalRework, color: '#b45309' },
    { label: 'Hold', value: stats.totalHold, color: '#7c3aed' },
    { label: 'Rejected', value: stats.totalRejected, color: '#374151' },
  ].filter((s) => s.value > 0);

  // ── 30-day time-series for sparkline inputs ──
  const byDay: any[] = stats.inspectionsByDay ?? [];
  const totalsSeries = byDay.map((d) => d.total);
  const passedSeries = byDay.map((d) => d.passed);
  const failedSeries = byDay.map((d) => d.failed);
  const defectsSeries = byDay.map(
    (d) => d.failed + (d.rework ?? 0) + (d.hold ?? 0) + (d.rejected ?? 0),
  );

  // 7-day delta vs previous 7 days (rough). Slice the time-series into
  // the most-recent and prior 7-day buckets so we can sum numeric
  // totals — passing the Day objects to deltaPct would yield NaN.
  const last7 = byDay.slice(-7);
  const prev7 = byDay.slice(-14, -7);
  const last7Totals = last7.map((d) => d.total);
  const prev7Totals = prev7.map((d) => d.total);
  const last7Defects = last7.map(
    (d) => d.failed + (d.rework ?? 0) + (d.hold ?? 0) + (d.rejected ?? 0),
  );
  const prev7Defects = prev7.map(
    (d) => d.failed + (d.rework ?? 0) + (d.hold ?? 0) + (d.rejected ?? 0),
  );
  const last7Passed = last7.map((d) => d.passed);
  const prev7Passed = prev7.map((d) => d.passed);
  const last7Failed = last7.map((d) => d.failed);
  const prev7Failed = prev7.map((d) => d.failed);

  // 7-day delta vs previous 7 days (rough). Accepts either two number
  // arrays (we sum them) or two raw numbers. Returns null (KpiTile
  // hides the pill) when the comparison isn't meaningful — either
  // because both periods are too small or because the previous period
  // is empty (Infinity % would otherwise show).
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const deltaPct = (a: number[] | number, b: number[] | number): number | null => {
    const aSum = Array.isArray(a) ? sum(a) : a;
    const bSum = Array.isArray(b) ? sum(b) : b;
    if (bSum < 5) return null;
    const d = Math.round(((aSum - bSum) / bSum) * 100);
    return Math.max(-999, Math.min(999, d));
  };

  const categoryRows: BarListRow[] = (stats.inspectionsByCategory ?? []).map(
    (r: any) => ({
      key: r.categoryId ?? r.categoryName,
      label: r.categoryName ?? '— Uncategorised —',
      value: r.count,
      color: 'rgb(var(--brand))',
    }),
  );

  const supplierRows: BarListRow[] = (stats.inspectionsBySupplier ?? [])
    .slice(0, 6)
    .map((r: any) => ({
      key: r.supplierId ?? r.supplierName,
      label: r.supplierName ?? '— Unassigned —',
      value: r.count,
      color: 'rgb(var(--accept))',
    }));

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-stone-500 mb-1">
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <span className="mx-1.5">/</span>
            <span className="text-stone-700">Executive</span>
          </div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Executive overview
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Live quality snapshot — pass rates, supplier mix, and recent failures.
          </p>
        </div>
        <div className="text-xs text-stone-500 text-right">
          <div>Snapshot generated {fmtDateTime(stats.snapshotGeneratedAt)}</div>
          <div className="mt-0.5">
            <Link href="/dashboard/analytics" className="text-qc-deep font-medium hover:underline">
              Open analytics workbench →
            </Link>
          </div>
        </div>
      </header>

      {/* Hero KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile
          label="Total inspections"
          value={stats.totalInspections}
          series={totalsSeries}
          seriesColor="rgb(var(--brand))"
          deltaPct={deltaPct(last7Totals, prev7Totals)}
          upIsGood={true}
          accent="rgb(var(--brand))"
        />
        <KpiTile
          label="Pass rate"
          value={`${stats.passRatePercentage}%`}
          hint={`${stats.totalPassed} of ${stats.totalInspections} passed`}
          series={passedSeries}
          seriesColor="rgb(var(--accept))"
          deltaPct={deltaPct(last7Passed, prev7Passed)}
          upIsGood={true}
          accent="rgb(var(--accept))"
        />
        <KpiTile
          label="Failures"
          value={stats.totalFailed + stats.totalRejected}
          hint={`${stats.totalFailed} FAIL, ${stats.totalRejected} REJECTED`}
          series={failedSeries}
          seriesColor="rgb(var(--reject))"
          deltaPct={deltaPct(last7Failed, prev7Failed)}
          upIsGood={false}
          accent="rgb(var(--reject))"
        />
        <KpiTile
          label="Total defects logged"
          value={stats.defectTallies?.totalDefects ?? 0}
          hint={`${stats.defectTallies?.totalCritical ?? 0} critical · ${stats.defectTallies?.totalMajor ?? 0} major · ${stats.defectTallies?.totalMinor ?? 0} minor`}
          series={defectsSeries}
          seriesColor="#b45309"
          deltaPct={deltaPct(last7Defects, prev7Defects)}
          upIsGood={false}
          accent="#b45309"
        />
      </div>

      {/* Status mix + recent failures */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel
          title="Inspection status mix"
          subtitle="Distribution across all-time inspections"
          className="lg:col-span-1"
        >
          {statusSlices.length === 0 ? (
            <div className="text-stone-400 text-sm">No inspections yet.</div>
          ) : (
            <DonutChart
              data={statusSlices}
              centerLabel={`${stats.passRatePercentage}%`}
              centerSubLabel="Pass rate"
            />
          )}
        </Panel>

        <Panel
          title="Recent failures"
          subtitle="Most recent inspections that did not pass"
          className="lg:col-span-2"
        >
          {stats.recentFailures?.length === 0 ? (
            <div className="text-stone-400 text-sm">
              No failures recorded 🎉
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-stone-500 text-[11px] uppercase tracking-wider border-b border-stone-200">
                  <th className="py-2">When</th>
                  <th>Category</th>
                  <th>Supplier</th>
                  <th className="text-right">Critical</th>
                  <th className="text-right">Major</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentFailures.map((r: any) => (
                  <tr
                    key={r.id}
                    className="border-b border-stone-100 last:border-0"
                  >
                    <td className="py-2.5 text-stone-700">
                      {fmtRelative(r.createdAt)}
                    </td>
                    <td className="text-stone-700 truncate max-w-[160px]">
                      {r.category || '—'}
                    </td>
                    <td className="text-stone-700 truncate max-w-[180px]">
                      {r.supplier || '—'}
                    </td>
                    <td className="text-right font-mono tabular-nums">
                      <span
                        className={
                          r.totalCritical > 0
                            ? 'text-reject-deep font-semibold'
                            : 'text-stone-400'
                        }
                      >
                        {r.totalCritical}
                      </span>
                    </td>
                    <td className="text-right font-mono tabular-nums">
                      <span
                        className={
                          r.totalMajor > 0
                            ? 'text-rework font-semibold'
                            : 'text-stone-400'
                        }
                      >
                        {r.totalMajor}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {/* Category & Supplier mix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="Inspections by category"
          subtitle="Top categories by inspection volume"
        >
          {categoryRows.length === 0 ? (
            <div className="text-stone-400 text-sm">No data yet</div>
          ) : (
            <BarList rows={categoryRows} />
          )}
        </Panel>
        <Panel
          title="Inspections by supplier"
          subtitle="Top suppliers by inspection volume"
          action={
            <Link
              href="/dashboard/performance"
              className="text-xs text-qc-deep font-medium hover:underline"
            >
              Vendor performance →
            </Link>
          }
        >
          {supplierRows.length === 0 ? (
            <div className="text-stone-400 text-sm">No data yet</div>
          ) : (
            <BarList rows={supplierRows} />
          )}
        </Panel>
      </div>
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-stone-900">Dashboard</h1>
      <div className="bg-reject-soft border border-reject-border text-reject-deep p-4 rounded">
        <div className="font-semibold mb-1">Unable to load stats.</div>
        <div className="text-xs font-mono break-all opacity-80">{error}</div>
      </div>
    </div>
  );
}
