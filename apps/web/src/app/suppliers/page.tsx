import { apiFetchOptional } from '@/lib/api';
import SuppliersTable from './SuppliersTable';

async function fetchSuppliers(): Promise<any[]> {
  return (
    (await apiFetchOptional<any[]>('/suppliers', {}, '/suppliers')) ?? []
  );
}

export default async function SuppliersPage() {
  const suppliers = await fetchSuppliers();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Suppliers</h1>
      <SuppliersTable initial={suppliers} />
    </div>
  );
}
