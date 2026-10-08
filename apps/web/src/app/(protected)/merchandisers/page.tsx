import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { requireCurrentUser } from '@/lib/server-session';
import MerchandisersEditor, { type Merchandiser } from './MerchandisersEditor';

export const dynamic = 'force-dynamic';

export default async function MerchandisersPage() {
  const caller = await requireCurrentUser();
  if (caller.role !== 'admin') redirect('/dashboard');

  const merchandisers = await apiFetch<Merchandiser[]>(
    '/merchandisers',
    {},
    '/merchandisers',
  );

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Merchandisers</h1>
      <p className="-mt-2 mb-4 text-sm text-stone-500">
        Maintain the commercial contacts available to inspection workflows.
        Inactive records remain available for history.
      </p>
      <MerchandisersEditor initial={merchandisers} />
    </div>
  );
}
