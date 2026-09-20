import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import InspectionTypesEditor from './InspectionTypesEditor';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

async function fetchTypes(): Promise<{ types: any[]; unauthorized: boolean }> {
  const token = cookies().get('qc_access')?.value;
  if (!token) return { types: [], unauthorized: true };
  const res = await fetch(`${API}/inspection-types`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  // 401 means the cookie is present but the access JWT is expired/invalid.
  // Don't silently render an empty list — that hides the real problem from
  // the user. Bounce them to /login so they re-authenticate and get a
  // fresh token.
  if (res.status === 401) return { types: [], unauthorized: true };
  if (!res.ok) return { types: [], unauthorized: false };
  return { types: await res.json(), unauthorized: false };
}

export default async function InspectionTypesPage() {
  if (!cookies().get('qc_access')?.value) redirect('/login?expired=1');
  const { types, unauthorized } = await fetchTypes();
  if (unauthorized) redirect('/login');
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Inspection Types</h1>
      <p className="text-sm text-stone-500 mb-4 -mt-2">
        Codes used when creating an inspection (INLINE, FINAL, DUPRO, …).
        Inactive codes are hidden from the create-inspection dropdown.
      </p>
      <InspectionTypesEditor initial={types} />
    </div>
  );
}