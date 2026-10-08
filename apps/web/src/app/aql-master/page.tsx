import { apiFetchOptional } from '@/lib/api';
import AqlMasterEditor from './AqlMasterEditor';

async function fetchAqlMaster(): Promise<any[]> {
  return (
    (await apiFetchOptional<any[]>('/aql-master', {}, '/aql-master')) ?? []
  );
}

export default async function AqlMasterPage() {
  const rows = await fetchAqlMaster();
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
