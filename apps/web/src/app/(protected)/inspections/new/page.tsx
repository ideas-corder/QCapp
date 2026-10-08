import NewInspectionForm from './NewInspectionForm';
import { SetupMastersButton } from './SetupMastersButton';
import { getUiLayoutFromCookie } from '@/lib/preferences';
import { apiFetchOptional } from '@/lib/api';
import { requireCurrentUser } from '@/lib/server-session';

interface ProductCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

interface Category {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  // legacy AQL-bearing categories still drive the AQL preview defaults
  aqlSetup?: any;
}

interface Supplier {
  id: string;
  vendorId: string | null;
  name: string;
}

interface Inspector {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

interface InspectionType {
  id: string;
  code: string;
  label: string;
  isActive: boolean;
}

interface AqlMaster {
  id: string;
  minQty: number;
  maxQty: number;
  sampleSize: number;
  description: string;
  isActive: boolean;
}

async function fetchOptions() {
  const returnTo = '/inspections/new';
  // Authenticate once before starting the parallel master-data requests.
  // The protected layout calls the same cached helper, so both share one
  // /auth/me request during this server render.
  await requireCurrentUser();
  const [
    cats,
    prodCats,
    sups,
    insps,
    types,
    aqlMaster,
  ] = await Promise.all([
    apiFetchOptional<Category[]>('/categories', {}, returnTo),
    apiFetchOptional<ProductCategory[]>(
      '/product-categories?activeOnly=true',
      {},
      returnTo,
    ),
    apiFetchOptional<Supplier[]>('/suppliers', {}, returnTo),
    apiFetchOptional<Inspector[]>('/inspectors?activeOnly=true', {}, returnTo),
    apiFetchOptional<InspectionType[]>(
      '/inspection-types?activeOnly=true',
      {},
      returnTo,
    ),
    apiFetchOptional<AqlMaster[]>('/aql-master?activeOnly=true', {}, returnTo),
  ]);
  return {
    cats: cats ?? [],
    prodCats: prodCats ?? [],
    sups: sups ?? [],
    insps: insps ?? [],
    types: types ?? [],
    aqlMaster: (aqlMaster ?? []).filter((m) => m.isActive),
  };
}

export default async function NewInspectionPage() {
  const { cats, prodCats, sups, insps, types, aqlMaster } =
    await fetchOptions();
  const activeCategories = cats.filter((c) => c.isActive);

  // Collect the masters that have zero active rows. These are required
  // dropdowns in the New Inspection form — without them the user has nothing
  // to pick and the form silently fails to submit. We surface a single
  // consolidated banner with a one-click auto-seed instead of four stacked
  // ones, so the user has one decisive action to take.
  const missing: Array<{
    key: 'productCategories' | 'suppliers' | 'inspectors' | 'inspectionTypes';
    label: string;
    href: string;
  }> = [];
  if (prodCats.length === 0) {
    missing.push({ key: 'productCategories', label: 'product categories', href: '/product-categories' });
  }
  if (sups.length === 0) {
    missing.push({ key: 'suppliers', label: 'suppliers', href: '/suppliers' });
  }
  if (insps.length === 0) {
    missing.push({ key: 'inspectors', label: 'inspectors', href: '/inspectors' });
  }
  if (types.length === 0) {
    missing.push({ key: 'inspectionTypes', label: 'inspection types', href: '/inspection-types' });
  }

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-3.5rem)] flex flex-col">
      {missing.length > 0 && (
        <div
          data-testid="setup-required-banner"
          className="mb-4 shrink-0 p-5 rounded-xl border-2 border-amber-300 bg-amber-50 text-sm text-amber-900"
          role="status"
        >
          <div className="flex items-start gap-3 mb-3">
            <span aria-hidden="true" className="text-2xl leading-none">⚠</span>
            <div className="flex-1">
              <div className="text-base font-semibold mb-1">
                Setup required
              </div>
              <div className="text-sm text-amber-800">
                {missing.length} master{missing.length === 1 ? '' : 's'} need{missing.length === 1 ? 's' : ''} at least one active row before you can create an inspection —{' '}
                {missing.map((m, i) => (
                  <span key={m.key}>
                    {i > 0 && ', '}
                    <a className="underline font-medium" href={m.href}>{m.label}</a>
                  </span>
                ))}
                . You can add them manually from the linked pages, or use the
                button below to seed a minimal default row in each.
              </div>
            </div>
          </div>
          <SetupMastersButton missing={missing.map((m) => m.key)} />
        </div>
      )}

      <div className="flex-1 min-h-0">
        <NewInspectionForm
          categories={activeCategories}
          aqlMaster={aqlMaster}
          productCategories={prodCats}
          suppliers={sups}
          inspectors={insps}
          inspectionTypes={types}
          layout={getUiLayoutFromCookie()}
        />
      </div>
    </div>
  );
}
