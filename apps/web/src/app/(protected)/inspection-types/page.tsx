import { apiFetchOptional } from '@/lib/api';
import InspectionTypesEditor from './InspectionTypesEditor';

async function fetchTypes(): Promise<any[]> {
  return (
    (await apiFetchOptional<any[]>(
      '/inspection-types',
      {},
      '/inspection-types',
    )) ?? []
  );
  // 401 means the cookie is present but the access JWT is expired/invalid.
  // Don't silently render an empty list — that hides the real problem from
  // the user. Bounce them to /login so they re-authenticate and get a
  // fresh token.
}

export default async function InspectionTypesPage() {
  const types = await fetchTypes();
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
