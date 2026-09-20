import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ProductCategoriesEditor from './ProductCategoriesEditor';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

async function fetchProductCategories(): Promise<{ items: any[]; unauthorized: boolean }> {
  const token = cookies().get('qc_access')?.value;
  if (!token) return { items: [], unauthorized: true };
  const res = await fetch(`${API}/product-categories`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 401) return { items: [], unauthorized: true };
  if (!res.ok) return { items: [], unauthorized: false };
  return { items: await res.json(), unauthorized: false };
}

export default async function ProductCategoriesPage() {
  if (!cookies().get('qc_access')?.value) redirect('/login?expired=1');
  const { items, unauthorized } = await fetchProductCategories();
  if (unauthorized) redirect('/login');
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Product Categories</h1>
      <p className="text-sm text-stone-500 mb-4 -mt-2">
        Lightweight "what kind of product" picker shown on the new-inspection
        form. Independent from the AQL-bearing Categories master.
        Inactive entries are hidden from the form.
      </p>
      <ProductCategoriesEditor initial={items} />
    </div>
  );
}
