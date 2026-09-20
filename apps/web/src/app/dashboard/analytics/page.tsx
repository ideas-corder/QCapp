/**
 * C. Business Analytics Workbench — the deepest dashboard.
 *
 * Sections (top-to-bottom):
 *   1. Hero KPIs with sparklines (total, pass rate, defect rate, defects)
 *   2. 30-day trend chart — line chart with 3 series: Total / Passed / Failed
 *   3. Defect Pareto (top keywords) + status mix donut side by side
 *   4. Inspector productivity leaderboard + defect severity breakdown
 *
 * Data comes from `/inspections/dashboard` (single endpoint).
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { fetchDashboardStats } from '@/components/dashboard/fetchDashboard';
import KpiTile from '@/components/dashboard/KpiTile';
import Panel from '@/components/dashboard/Panel';
import DonutChart, { DonutSlice } from '@/components/dashboard/DonutChart';
import BarList, { BarListRow } from '@/components/dashboard/BarList';
import LeaderboardTable, {
  LeaderboardEntry,
} from '@/components/dashboard/LeaderboardTable';
import TrendLineChart, { TrendSeries } from '@/components/dashboard/TrendLineChart';
import { fmtRelative, fmtShortDate } from '@/components/dashboard/format';

export const dynamic = 'force-dynamic';

export default async function AnalyticsWorkbench() {
  const token = cookies().get('qc_access')?.value;
  if (!token) redirect('/login?expired=1');

  const result = await fetchDashboardStats();
  if (!result.ok) {
    return <ErrorState error={result.error} />;
  }
  const stats = result.stats;

  const byDay: any[] = stats.inspectionsByDay ?? [];
  const totalsSeries = byDay.map((d) => d.total);
  const passedSeries = byDay.map((d) => d.passed);
  const failedSeries = byDay.map((d) => d.failed + (d.rejected ?? 0));

  const trendSeries: TrendSeries[] = [
    { name: 'Total inspections', color: 'rgb(var(--brand))', values: totalsSeries },
    { name: 'Passed', color: 'rgb(var(--accept))', values: passedSeries },
    { name: 'Failed + Rejected', color: 'rgb(var(--reject))', values: failedSeries },
  ];
  const trendLabels = byDay.map((d) => fmtShortDate(d.date));

  const last7 = byDay.slice(-7);
  const prev7 = byDay.slice(-14, -7);
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const deltaPct = (a: number[], b: number[]): number | null => {
    const aSum = sum(a);
    const bSum = sum(b);
    if (bSum < 5) return null;
    const d = Math.round(((aSum - bSum) / bSum) * 100);
    return Math.max(-999, Math.min(999, d));
  };

  const defectRows: BarListRow[] = (stats.topDefectTypes ?? []).map(
    (r: any) => ({
      key: r.keyword,
      label: r.keyword,
      value: r.count,
      display: `${r.count}`,
      color:
        r.count > 5
          ? 'rgb(var(--reject))'
          : r.count > 2
          ? '#b45309'
          : 'rgb(var(--brand))',
    }),
  );

  const defectSeverity: DonutSlice[] = [
    {
      label: 'Critical',
      value: stats.defectTallies?.totalCritical ?? 0,
      color: 'rgb(var(--reject))',
    },
    {
      label: 'Major',
      value: stats.defectTallies?.totalMajor ?? 0,
      color: '#b45309',
    },
    {
      label: 'Minor',
      value: stats.defectTallies?.totalMinor ?? 0,
      color: 'rgb(var(--brand))',
    },
  ].filter((s) => s.value > 0);

  const statusMix: DonutSlice[] = [
    { label: 'Passed', value: stats.totalPassed, color: 'rgb(var(--accept))' },
    { label: 'Failed', value: stats.totalFailed, color: 'rgb(var(--reject))' },
    { label: 'Rework', value: stats.totalRework, color: '#b45309' },
    { label: 'Hold', value: stats.totalHold, color: '#7c3aed' },
    { label: 'Rejected', value: stats.totalRejected, color: '#374151' },
  ].filter((s) => s.value > 0);

  const inspectorEntries: LeaderboardEntry[] = (stats.inspectorProductivity ?? []).map(
    (r: any) => ({
      key: r.inspectorId ?? r.inspectorName,
      name: r.inspectorName ?? '— Unassigned —',
      total: r.totalInspections,
      passed: r.passed,
      passRate: r.passRate,
      sub: r.lastActivityAt ? `Last activity ${fmtRelative(r.lastActivityAt)}` : 'No activity',
      meta: undefined,
    }),
  );

  // Sum of last 7-day totals for the activity hero number.
  const last7Total = sum(last7.map((d) => d.total));

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-stone-500 mb-1">
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <span className="mx-1.5">/</span>
            <span className="text-stone-700">Analytics workbench</span>
          </div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Business analytics workbench
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            30-day trends, defect Pareto, inspector productivity, and status mix.
          </p>
        </div>
        <div className="text-xs text-stone-500 text-right">
          <div>
            Window: {new Date(stats.snapshotFrom).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
            {' '}→{' '}
            {new Date(stats.snapshotGeneratedAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
          </div>
          <div className="mt-0.5">
            <Link href="/dashboard/performance" className="text-qc-deep font-medium hover:underline">
              Drill into vendor performance →
            </Link>
          </div>
        </div>
      </header>

      {/* Hero KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile
          label="Last 7 days"
          value={last7Total}
          hint="Inspections in the past week"
          series={totalsSeries}
          seriesColor="rgb(var(--brand))"
          deltaPct={deltaPct(
            last7.map((d) => d.total),
            prev7.map((d) => d.total),
          )}
          upIsGood={true}
          accent="rgb(var(--brand))"
        />
        <KpiTile
          label="Pass rate"
          value={`${stats.passRatePercentage}%`}
          hint={`${stats.totalPassed} passed of ${stats.totalInspections}`}
          series={passedSeries}
          seriesColor="rgb(var(--accept))"
          deltaPct={deltaPct(
            last7.map((d) => d.passed),
            prev7.map((d) => d.passed),
          )}
          upIsGood={true}
          accent="rgb(var(--accept))"
        />
        <KpiTile
          label="Failure rate"
          value={`${stats.totalInspections > 0 ? Math.round(((stats.totalFailed + stats.totalRejected) / stats.totalInspections) * 100) : 0}%`}
          hint={`${stats.totalFailed + stats.totalRejected} failures`}
          series={failedSeries}
          seriesColor="rgb(var(--reject))"
          deltaPct={deltaPct(
            last7.map((d) => d.failed + (d.rejected ?? 0)),
            prev7.map((d) => d.failed + (d.rejected ?? 0)),
          )}
          upIsGood={false}
          accent="rgb(var(--reject))"
        />
        <KpiTile
          label="Total defects"
          value={stats.defectTallies?.totalDefects ?? 0}
          hint={`${stats.defectTallies?.totalCritical ?? 0} critical · ${stats.defectTallies?.totalMajor ?? 0} major`}
          accent="#b45309"
        />
      </div>

      {/* 30-day trend */}
      <Panel
        title="30-day inspection trend"
        subtitle="Daily counts — total, passed, and failed+rejected"
      >
        <TrendLineChart labels={trendLabels} series={trendSeries} height={240} />
      </Panel>

      {/* Pareto + Status Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="Top defect keywords"
          subtitle="Pareto over the last 800 defect descriptions"
        >
          <BarList rows={defectRows} />
        </Panel>
        <Panel
          title="Defect severity mix"
          subtitle="Total defects broken down by severity"
        >
          {defectSeverity.length === 0 ? (
            <div className="text-stone-400 text-sm">No defects logged yet.</div>
          ) : (
            <DonutChart
              data={defectSeverity}
              centerLabel={`${stats.defectTallies?.totalDefects ?? 0}`}
              centerSubLabel="Total"
            />
          )}
        </Panel>
      </div>

      {/* Inspector + Status mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel
          title="Inspector productivity"
          subtitle="Top inspectors by volume & pass rate"
          className="lg:col-span-2"
        >
          <LeaderboardTable entries={inspectorEntries} nameLabel="Inspector" />
        </Panel>
        <Panel
          title="Inspection status mix"
          subtitle="All-time distribution"
        >
          {statusMix.length === 0 ? (
            <div className="text-stone-400 text-sm">No inspections yet.</div>
          ) : (
            <DonutChart
              data={statusMix}
              centerLabel={`${stats.passRatePercentage}%`}
              centerSubLabel="Pass rate"
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-stone-900">Analytics workbench</h1>
      <div className="bg-reject-soft border border-reject-border text-reject-deep p-4 rounded">
        <div className="font-semibold mb-1">Unable to load stats.</div>
        <div className="text-xs font-mono break-all opacity-80">{error}</div>
      </div>
    </div>
  );
}