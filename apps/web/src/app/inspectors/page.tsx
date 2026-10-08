import { apiFetchOptional } from '@/lib/api';
import InspectorsEditor from './InspectorsEditor';

async function fetchInspectors(): Promise<any[]> {
  return (
    (await apiFetchOptional<any[]>('/inspectors', {}, '/inspectors')) ?? []
  );
}

export default async function InspectorsPage() {
  const items = await fetchInspectors();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Inspectors</h1>
      <p className="text-sm text-stone-500 mb-4 -mt-2">
        Roster of people who sign inspections — independent from app
        login accounts. Picker on the new-inspection form is sourced from
        this list. Inactive entries are hidden from the form.
      </p>
      <InspectorsEditor initial={items} />
    </div>
  );
}
