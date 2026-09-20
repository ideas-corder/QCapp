import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import InspectorsEditor from './InspectorsEditor';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

async function fetchInspectors(): Promise<{ items: any[]; unauthorized: boolean }> {
  const token = cookies().get('qc_access')?.value;
  if (!token) return { items: [], unauthorized: true };
  const res = await fetch(`${API}/inspectors`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 401) return { items: [], unauthorized: true };
  if (!res.ok) return { items: [], unauthorized: false };
  return { items: await res.json(), unauthorized: false };
}

export default async function InspectorsPage() {
  if (!cookies().get('qc_access')?.value) redirect('/login?expired=1');
  const { items, unauthorized } = await fetchInspectors();
  if (unauthorized) redirect('/login');
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
