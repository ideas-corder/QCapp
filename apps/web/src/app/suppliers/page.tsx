import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import SuppliersTable from './SuppliersTable';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

async function fetchSuppliers(): Promise<{ suppliers: any[]; unauthorized: boolean }> {
  const token = cookies().get('qc_access')?.value;
  if (!token) return { suppliers: [], unauthorized: true };
  const res = await fetch(`${API}/suppliers`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 401) return { suppliers: [], unauthorized: true };
  if (!res.ok) return { suppliers: [], unauthorized: false };
  return { suppliers: await res.json(), unauthorized: false };
}

export default async function SuppliersPage() {
  if (!cookies().get('qc_access')?.value) redirect('/login?expired=1');
  const { suppliers, unauthorized } = await fetchSuppliers();
  if (unauthorized) redirect('/login');
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Suppliers</h1>
      <SuppliersTable initial={suppliers} />
    </div>
  );
}
