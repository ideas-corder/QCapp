import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * Inspection row — minimal shape the grid needs to render.
 * Kept here (not in `InspectionsTable`) so the customiser and any
 * other surface can import it without dragging the table.
 */
export type Inspection = {
  id: string;
  createdAt: string;
  inspectionNumber?: string | null;
  poNumber: string | null;
  itemNumber: string | null;
  itemDescription?: string | null;
  inspectionDate?: string | null;
  deliveryDate?: string | null;
  merchandiserName?: string | null;
  inspectorName?: string | null;
  inspectionType?: string;
  productCategory?: { name: string } | null;
  aqlMaster?: { description?: string } | null;
  orderQuantity?: string | number | null;
  totalCritical: number;
  totalMajor: number;
  totalMinor: number;
  debitNote?: { answer?: '' | 'YES' | 'NO' } | null;
  overallResult:
    | 'PASS'
    | 'FAIL'
    | 'PENDING_REVIEW'
    | 'REWORK'
    | 'HOLD'
    | 'COMMERCIAL_APPROVED'
    | 'REJECTED';
  syncStatus: 'SYNCED' | 'PENDING_SYNC' | 'FAILED';
  category?: { name: string };
  supplier?: { name: string };
};

/**
 * Server-side sort key the column header maps to. Mirrors the enum
 * in `apps/api/src/inspections/dto/inspection.dto.ts`. Empty string
 * means the column is not sortable.
 */
export type SortKey = string;

export const RESULT_STYLE: Record<Inspection['overallResult'], string> = {
  PASS: 'bg-accept-soft text-accept-deep',
  FAIL: 'bg-reject-soft text-reject-deep',
  REWORK: 'bg-amber-100 text-amber-800',
  HOLD: 'bg-amber-100 text-amber-800',
  COMMERCIAL_APPROVED: 'bg-blue-100 text-blue-800',
  REJECTED: 'bg-orange-200 text-orange-900',
  PENDING_REVIEW: 'bg-yellow-100 text-yellow-800',
};

export const SYNC_STYLE: Record<Inspection['syncStatus'], string> = {
  SYNCED: 'text-stone-500',
  PENDING_SYNC: 'text-pending',
  FAILED: 'text-fail',
};

/**
 * Severity chip colour (matches the modernised StepCard).
 * 0 = none (grey), 1-3 = yellow, 4-10 = orange, 11+ = red.
 */
export function severityChipStyle(total: number): string {
  if (total === 0) return 'bg-stone-100 text-stone-600';
  if (total <= 3) return 'bg-yellow-100 text-yellow-800';
  if (total <= 10) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}

export function totalDefects(i: Inspection): number {
  return (i.totalCritical ?? 0) + (i.totalMajor ?? 0) + (i.totalMinor ?? 0);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.length === 10 ? iso : new Date(iso).toLocaleDateString();
}

/**
 * Text-operator vocabulary surfaced in the per-column filter popover.
 * Mirrors the server-side `FilterOp` union (see
 * `apps/api/src/inspections/column-filter.registry.ts`). UI labels
 * stay friendly; the wire shape carries the snake-case op name so
 * the server parser can map it directly.
 */
export type TextFilterOp =
  | 'contains'
  | 'beginsWith'
  | 'endsWith'
  | 'isExactly'
  | 'oneOf'
  | 'match';

export const TEXT_FILTER_OPS: { value: TextFilterOp; label: string; hint?: string }[] = [
  { value: 'contains', label: 'Contains' },
  { value: 'beginsWith', label: 'Begins with' },
  { value: 'endsWith', label: 'Ends with' },
  { value: 'isExactly', label: 'Is exactly' },
  { value: 'oneOf', label: 'Is one of' },
  { value: 'match', label: 'Match (regex)', hint: 'POSIX case-insensitive' },
];

/**
 * Column definition. `key` is the stable identifier — the same key
 * is used in URL params, persisted layouts, and the column-reorder
 * list, so it MUST NOT change once a view has been saved by a user.
 *
 * `defaultVisible: false` hides a column by default (still available
 * via the customiser). `required: true` columns cannot be hidden
 * (radio select, actions).
 *
 * `filterable` describes the per-column filter UI the grid offers:
 *   - `text`      → free-form input + operator dropdown
 *   - `enum`      → multi-select chip list driven by `enumValues`
 *   - `number`    → min/max number pair
 *   - `date`      → from/to date pickers (ISO yyyy-mm-dd)
 *   - undefined   → column cannot be filtered from the grid
 */
export type ColumnFilterSpec =
  | { kind: 'text'; placeholder?: string; defaultOp?: TextFilterOp }
  | { kind: 'enum'; enumValues: readonly string[]; enumLabels?: Record<string, string> }
  | { kind: 'number'; min?: number; max?: number; step?: number }
  | { kind: 'date' };

export type ColumnDef = {
  key: string;
  label: string;
  defaultWidth: number;
  minWidth?: number;
  sortable?: boolean;
  sortValue?: SortKey;
  align?: 'left' | 'right';
  required?: boolean;
  defaultVisible?: boolean;
  filterable?: ColumnFilterSpec;
  /** Render the cell for `row`. Keep narrow; complex cells live in
   *  their own component if they grow. */
  render: (row: Inspection) => ReactNode;
};

/**
 * The single source of truth for column behaviour. To add a column,
 * append a new entry here — the customiser and the table pick it up
 * automatically. Required columns (radio + actions) are pinned and
 * can't be hidden or removed.
 */
export const COLUMNS: ColumnDef[] = [
  {
    key: 'select',
    label: '',
    defaultWidth: 40,
    minWidth: 40,
    required: true,
    render: () => null, // rendered specially by the table
  },
  {
    // Inspection Document Number — printed on the PDF, customer-facing
    // reference. Sortable + filterable on the same vocabulary as the
    // other text columns (contains / begins / ends / exactly / oneOf /
    // regex). Pinned to be visible by default since admins reference it
    // frequently when cross-checking with paper records.
    key: 'inspectionNumber',
    label: 'Doc No',
    defaultWidth: 160,
    minWidth: 120,
    sortable: true,
    sortValue: 'INSPECTION_NUMBER_ASC',
    filterable: { kind: 'text', placeholder: 'contains…' },
    render: (i) =>
      i.inspectionNumber ? (
        <span className="font-mono text-stone-700">{i.inspectionNumber}</span>
      ) : (
        '—'
      ),
  },
  {
    key: 'po',
    label: 'PO',
    defaultWidth: 130,
    minWidth: 80,
    sortable: true,
    sortValue: 'PO_ASC',
    filterable: { kind: 'text', placeholder: 'contains…' },
    render: (i) => i.poNumber || '—',
  },
  {
    key: 'design',
    label: 'Design',
    defaultWidth: 110,
    minWidth: 80,
    sortable: true,
    sortValue: 'DESIGN_ASC',
    filterable: { kind: 'text', placeholder: 'contains…' },
    render: (i) => i.itemNumber || '—',
  },
  {
    key: 'itemDescription',
    label: 'Item description',
    defaultWidth: 240,
    minWidth: 120,
    filterable: { kind: 'text', placeholder: 'contains…' },
    render: (i) => (
      <span className="block max-w-full truncate" title={i.itemDescription ?? ''}>
        {i.itemDescription || '—'}
      </span>
    ),
  },
  {
    key: 'type',
    label: 'Type',
    defaultWidth: 110,
    sortable: true,
    sortValue: 'TYPE_ASC',
    filterable: { kind: 'text', placeholder: 'contains…' },
    render: (i) => i.inspectionType || '—',
  },
  {
    key: 'category',
    label: 'Category',
    defaultWidth: 150,
    sortable: true,
    sortValue: 'CATEGORY_ASC',
    // Per-column filter removed (per your answer): Category filtering is
    // FK-based and the toolbar dropdown still drives it via `categoryIds`.
    // Column stays hideable — not `required`.
    render: (i) => i.category?.name ?? '—',
  },
  {
    key: 'supplier',
    label: 'Supplier',
    defaultWidth: 220,
    minWidth: 120,
    sortable: true,
    sortValue: 'SUPPLIER_ASC',
    // Supplier filtering is FK-based; handled by the legacy `supplierIds`
    // param on the existing filter bar.
    render: (i) => i.supplier?.name ?? '—',
  },
  {
    key: 'aql',
    label: 'AQL',
    defaultWidth: 180,
    sortable: true,
    sortValue: 'AQL_ASC',
    filterable: { kind: 'text', placeholder: 'contains…' },
    render: (i) => i.aqlMaster?.description || '—',
  },
  {
    key: 'inspector',
    label: 'Inspector',
    defaultWidth: 150,
    sortable: true,
    sortValue: 'INSPECTOR_NAME_ASC',
    filterable: { kind: 'text', placeholder: 'contains…' },
    render: (i) => i.inspectorName || '—',
  },
  {
    key: 'merchandiser',
    label: 'Merchandiser',
    defaultWidth: 150,
    sortable: true,
    sortValue: 'MERCHANDISER_NAME_ASC',
    filterable: { kind: 'text', placeholder: 'contains…' },
    render: (i) => i.merchandiserName || '—',
  },
  {
    // The grid's date column — formerly rendered from `createdAt`
    // under the key `when`. Replaced with the `inspectionDate` column
    // so the two sources of date truth don't get out of sync. The
    // legacy `when` key is removed (any saved view that pinned it
    // simply drops it on load).
    key: 'inspectionDate',
    label: 'Inspection date',
    defaultWidth: 130,
    sortable: true,
    sortValue: 'INSPECTION_DATE_DESC',
    filterable: { kind: 'date' },
    render: (i) => fmtDate(i.inspectionDate),
  },
  {
    key: 'deliveryDate',
    label: 'Delivery date',
    defaultWidth: 130,
    sortable: true,
    sortValue: 'DELIVERY_DATE_DESC',
    filterable: { kind: 'date' },
    render: (i) => fmtDate(i.deliveryDate),
  },
  {
    key: 'orderQty',
    label: 'Order qty',
    defaultWidth: 110,
    align: 'right',
    sortable: true,
    sortValue: 'ORDER_QTY_DESC',
    filterable: { kind: 'number', min: 0, step: 1 },
    render: (i) =>
      i.orderQuantity == null ? '—' : Number(i.orderQuantity).toLocaleString(),
  },
  {
    key: 'severity',
    label: 'Severity',
    defaultWidth: 110,
    align: 'right',
    sortable: true,
    sortValue: 'SEVERITY_DESC',
    filterable: { kind: 'number', min: 0, step: 1 },
    render: (i) => (
      <span
        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${severityChipStyle(totalDefects(i))}`}
        title={`Critical ${i.totalCritical} · Major ${i.totalMajor} · Minor ${i.totalMinor}`}
      >
        {totalDefects(i)}
      </span>
    ),
  },
  {
    key: 'debitNote',
    label: 'Debit note',
    defaultWidth: 110,
    filterable: {
      kind: 'enum',
      enumValues: ['YES', 'NO', ''],
      enumLabels: { YES: 'Yes', NO: 'No', '': '(unset)' },
    },
    render: (i) =>
      i.debitNote?.answer === 'YES' ? (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-reject-soft text-reject-deep">
          Yes
        </span>
      ) : i.debitNote?.answer === 'NO' ? (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-stone-100 text-stone-600">
          No
        </span>
      ) : (
        <span className="text-xs text-stone-400">—</span>
      ),
  },
  {
    key: 'result',
    label: 'Result',
    defaultWidth: 120,
    sortable: true,
    sortValue: 'DATE_DESC',
    filterable: {
      kind: 'enum',
      enumValues: ['PASS', 'FAIL', 'PENDING_REVIEW', 'REWORK', 'HOLD', 'COMMERCIAL_APPROVED', 'REJECTED'],
      enumLabels: {
        PASS: 'Pass',
        FAIL: 'Fail',
        PENDING_REVIEW: 'Pending',
        REWORK: 'Rework',
        HOLD: 'Hold',
        COMMERCIAL_APPROVED: 'Commercial Approved',
        REJECTED: 'Rejected',
      },
    },
    render: (i) => (
      <span
        className={`px-2 py-0.5 rounded text-xs font-medium ${RESULT_STYLE[i.overallResult]}`}
      >
        {i.overallResult.replace(/_/g, ' ')}
      </span>
    ),
  },
  {
    key: 'sync',
    label: 'Sync',
    defaultWidth: 110,
    filterable: {
      kind: 'enum',
      enumValues: ['SYNCED', 'PENDING_SYNC', 'FAILED'],
      enumLabels: { SYNCED: 'Synced', PENDING_SYNC: 'Pending', FAILED: 'Failed' },
    },
    render: (i) => (
      <span className={`text-xs ${SYNC_STYLE[i.syncStatus]}`}>{i.syncStatus}</span>
    ),
  },
  {
    key: 'actions',
    label: '',
    defaultWidth: 90,
    minWidth: 80,
    required: true,
    render: (i) => (
      <Link href={`/inspections/${i.id}`} className="text-qc-600 hover:underline">
        View
      </Link>
    ),
  },
];

export const DEFAULT_VISIBLE_KEYS: string[] = COLUMNS
  .filter((c) => c.required || c.defaultVisible !== false)
  .map((c) => c.key);

export const DEFAULT_COLUMN_ORDER: string[] = COLUMNS.map((c) => c.key);

export const DEFAULT_WIDTHS: Record<string, number> = Object.fromEntries(
  COLUMNS.map((c) => [c.key, c.defaultWidth]),
);

export function getColumn(key: string): ColumnDef | undefined {
  return COLUMNS.find((c) => c.key === key);
}
