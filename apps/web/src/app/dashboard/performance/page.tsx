/**
 * B. Vendor Performance — supplier scorecards.
 *
 * Three sections:
 *   1. Hero banner — supplier count, weighted pass rate, top performer.
 *   2. Leaderboard table — every supplier with pass-rate badge + bar,
 *      inspections count, last activity.
 *   3. Top suppliers (pass-rate-bar) + worst suppliers (highlighted).
 *
 * The page reads `supplierLeaderboard` directly from the dashboard
 * endpoint, so no separate supplier query is needed.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { fetchDashboardStats } from '@/components/dashboard/fetchDashboard';
import KpiTile from '@/components/dashboard/KpiTile';
import Panel from '@/components/dashboard/Panel';
import LeaderboardTable, {
  LeaderboardEntry,
} from '@/components/dashboard/LeaderboardTable';
import { fmtRelative } from '@/components/dashboard/format';

export const dynamic = 'force-dynamic';

export default async function VendorPerformancePage() {
  const token = cookies().get('qc_access')?.value;
  if (!token) redirect('/login?expired=1');

  const result = await fetchDashboardStats();
  if (!result.ok) {
    return <ErrorState error={result.error} />;
  }
  const stats = result.stats;
  const board: any[] = stats.supplierLeaderboard ?? [];

  const entries: LeaderboardEntry[] = board.map((r) => ({
    key: r.supplierId ?? r.supplierName,
    name: r.supplierName ?? '— Unassigned —',
    total: r.totalInspections,
    passed: r.totalPassed,
    passRate: r.passRate,
    sub:
      r.totalFailed > 0 || r.totalRejected > 0
        ? `${r.totalFailed} FAIL · ${r.totalRejected} REJECTED`
        : r.totalRework > 0 || r.totalHold > 0
        ? `${r.totalRework} rework · ${r.totalHold} hold`
        : 'No issues',
    meta: r.lastInspectionAt ? `Last seen ${fmtRelative(r.lastInspectionAt)}` : undefined,
  }));

  // Weighted pass rate across all supplier inspections.
  const totalInspections = entries.reduce((s, e) => s + e.total, 0);
  const totalPassed = entries.reduce((s, e) => s + e.passed, 0);
  const weightedPass =
    totalInspections > 0
      ? Math.round((totalPassed / totalInspections) * 100)
      : 0;

  // Top performer = highest pass rate among suppliers with >= 3 inspections.
  const top = entries
    .filter((e) => e.total >= 3)
    .slice()
    .sort((a, b) => b.passRate - a.passRate)[0];
  // Worst = lowest pass rate, but only among suppliers with real
  // volume (>= 2 inspections). Otherwise a 0/1 record dominates and
  // looks misleading in the "needs attention" tile.
  const worstCandidates = entries.filter((e) => e.total >= 2);
  const worst = (worstCandidates.length > 0 ? worstCandidates : entries)
    .slice()
    .sort((a, b) => a.passRate - b.passRate)[0];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-stone-500 mb-1">
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <span className="mx-1.5">/</span>
            <span className="text-stone-700">Vendor performance</span>
          </div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Vendor performance
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Supplier scorecards ranked by pass rate. Use this page to spot
            vendors drifting below tolerance and to reward the reliable ones.
          </p>
        </div>
        <div className="text-xs text-stone-500 text-right">
          <div>Snapshot generated {fmtRelative(stats.snapshotGeneratedAt)}</div>
          <div className="mt-0.5">
            <Link href="/dashboard/analytics" className="text-qc-deep font-medium hover:underline">
              Defect Pareto in workbench →
            </Link>
          </div>
        </div>
      </header>

      {/* Hero KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile
          label="Active suppliers"
          value={entries.length}
          hint={`${entries.filter((e) => e.total > 0).length} with inspections`}
          accent="rgb(var(--brand))"
        />
        <KpiTile
          label="Weighted pass rate"
          value={`${weightedPass}%`}
          hint={`${totalPassed} of ${totalInspections} passed`}
          accent="rgb(var(--accept))"
        />
        <KpiTile
          label="Top performer"
          value={top ? `${top.passRate}%` : '—'}
          hint={top?.name ?? 'Need ≥ 3 inspections per supplier'}
          accent="rgb(var(--accept))"
        />
        <KpiTile
          label="Needs attention"
          value={worst ? `${worst.passRate}%` : '—'}
          hint={worst?.name ?? 'All clear'}
          accent="rgb(var(--reject))"
        />
      </div>

      {/* Leaderboard */}
      <Panel
        title="Supplier leaderboard"
        subtitle="Ranked by pass rate · shows last activity & breakdown"
        action={
          <span className="text-[11px] uppercase tracking-wider font-semibold text-stone-500">
            {entries.length} supplier{entries.length === 1 ? '' : 's'}
          </span>
        }
      >
        <LeaderboardTable entries={entries} />
      </Panel>

      {/* Best / Worst split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="Top 5 by pass rate"
          subtitle="≥ 3 inspections, ranked by pass rate"
        >
          <LeaderboardTable
            entries={entries
              .filter((e) => e.total >= 3)
              .slice()
              .sort((a, b) => b.passRate - a.passRate)
              .slice(0, 5)}
          />
        </Panel>
        <Panel
          title="Needs follow-up"
          subtitle="Suppliers below the 90% pass-rate threshold (or the lowest scorers when none qualify)"
        >
          <LeaderboardTable
            entries={(
              entries.filter((e) => e.passRate < 90).length > 0
                ? entries.filter((e) => e.passRate < 90)
                : entries
            )
              .slice()
              .sort((a, b) => a.passRate - b.passRate)
              .slice(0, 5)}
          />
        </Panel>
      </div>
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-stone-900">Vendor performance</h1>
      <div className="bg-reject-soft border border-reject-border text-reject-deep p-4 rounded">
        <div className="font-semibold mb-1">Unable to load stats.</div>
        <div className="text-xs font-mono break-all opacity-80">{error}</div>
      </div>
    </div>
  );
}