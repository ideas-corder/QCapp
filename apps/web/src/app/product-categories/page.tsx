import { apiFetchOptional } from '@/lib/api';
import ProductCategoriesEditor from './ProductCategoriesEditor';

async function fetchProductCategories(): Promise<any[]> {
  return (
    (await apiFetchOptional<any[]>(
      '/product-categories',
      {},
      '/product-categories',
    )) ?? []
  );
}

export default async function ProductCategoriesPage() {
  const items = await fetchProductCategories();
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
