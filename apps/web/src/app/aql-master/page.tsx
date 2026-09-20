import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AqlMasterEditor from './AqlMasterEditor';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

async function fetchAqlMaster(): Promise<{ rows: any[]; unauthorized: boolean }> {
  const token = cookies().get('qc_access')?.value;
  if (!token) return { rows: [], unauthorized: true };
  const res = await fetch(`${API}/aql-master`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 401) return { rows: [], unauthorized: true };
  if (!res.ok) return { rows: [], unauthorized: false };
  return { rows: await res.json(), unauthorized: false };
}

export default async function AqlMasterPage() {
  if (!cookies().get('qc_access')?.value) redirect('/login?expired=1');
  const { rows, unauthorized } = await fetchAqlMaster();
  if (unauthorized) redirect('/login');
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">AQL Master</h1>
      <p className="text-sm text-stone-600 mb-4">
        ANSI/ASQ Z1.4 single-sampling-plan lot-size buckets at General Level II
        (AQL = 2.5 Major). Each row tells inspectors how many units
        to draw (Inspect Qty) for a given lot size. Accept/Reject thresholds
        are computed at evaluation time from the chosen sample size and AQL
        limit, so each row only needs the lot-size range and Inspect Qty.
        The Code is auto-generated from Min / Max Qty.
      </p>
      <AqlMasterEditor initial={rows} />
    </div>
  );
}
