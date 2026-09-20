import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import InspectionsGrid from './InspectionsGrid';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

async function fetchInspections(params: URLSearchParams) {
  const token = cookies().get('qc_access')?.value;
  if (!token) return null;
  const res = await fetch(`${API}/inspections?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Inspections index — the legacy topbar (search + 11 dropdowns + Result /
 * Sync / Debit chip rows + presets) was removed in favour of in-grid
 * per-column filters. The grid's column headers each expose a funnel
 * popover that drives every filter shape we used to support from the
 * toolbar (text / enum / date / numeric / sort). Saved views round-trip
 * the active filter set via the URL (`filters=…`) and the saved-view
 * payload.
 */
export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const token = cookies().get('qc_access')?.value;
  if (!token) redirect('/login?expired=1');

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === 'string' && v) params.set(k, v);
  }

  const data = await fetchInspections(params);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          Inspections
          <span className="text-xs font-normal text-stone-500">
            {data ? `${data.total} total` : ''}
          </span>
        </h1>
        <a
          href="/inspections/new"
          className="bg-qc-strong hover:bg-qc-deep text-qc-on px-3 py-1.5 rounded text-sm"
        >
          + New inspection
        </a>
      </div>

      {!data ? (
        <div className="text-reject-deep bg-reject-soft border border-reject-border p-4 rounded">
          Could not load inspections.
        </div>
      ) : data.data.length === 0 ? (
        <div className="text-stone-500 bg-white p-8 rounded border text-center">
          No inspections match the current filter.
        </div>
      ) : (
        <InspectionsGrid rows={data.data} total={data.total} />
      )}
    </div>
  );
}
