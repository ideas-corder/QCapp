/**
 * Authoritative column → SQL mapping for the per-column filter
 * endpoint on the inspections list.
 *
 * Each entry says:
 *   - which column key the front-end sends (`columnKey`),
 *   - which DB column / expression it maps to (`sql`),
 *   - which operators are allowed and how each renders to SQL.
 *
 * Whitelist-based: unknown column keys are silently dropped so the
 * front-end can introduce new columns without an API bump. The
 * `filters` JSON list is parsed server-side; invalid entries are
 * skipped, not rejected, so a single bad filter doesn't blank the
 * whole grid.
 *
 * Operator vocabulary (text-typed columns):
 *   - `contains`     ILIKE '%value%'                — case-insensitive substring
 *   - `beginsWith`   ILIKE 'value%'                 — case-insensitive prefix
 *   - `endsWith`     ILIKE '%value'                 — case-insensitive suffix
 *   - `isExactly`    equality (case-insensitive)    — exact match, no wildcards
 *   - `oneOf`        IN ('a','b','c')               — multi-value OR (case-insensitive)
 *   - `match`        POSIX regex (~*, case-insensitive) — admin / power-user only
 */
export type FilterOp =
  | 'contains'
  | 'beginsWith'
  | 'endsWith'
  | 'isExactly'
  | 'oneOf'
  | 'match'
  | 'eq'
  | 'in'
  | 'gte'
  | 'lte'
  | 'between';

export type FilterEntry = {
  columnKey: string;
  op: FilterOp;
  /** Single value (contains / eq / gte / lte / beginsWith / endsWith /
   *  isExactly / match) or array (in / between / oneOf). */
  value: string | number | (string | number)[];
  /** Only used by `between` (the upper bound). */
  value2?: number | string;
};

export type ColumnType = 'text' | 'enum' | 'number' | 'date';

type ColumnRule = {
  /** Front-end column key (must match `COLUMNS[i].key`). */
  key: string;
  /** DB column reference; can be a raw expression like `(...)`. */
  sql: string;
  type: ColumnType;
  /**
   * Optional whitelist of enum values. Filters with `op: 'eq' | 'in'`
   * that fall outside this list are dropped (so a stale front-end
   * can't smuggle a query for a removed result code).
   */
  enumValues?: readonly string[];
  /**
   * Whether this column participates in the text-operator expansion.
   * Defaults to `true` for `text` columns and `false` otherwise; set
   * explicitly to override.
   */
  supportsTextOps?: boolean;
};

const RULES: ColumnRule[] = [
  // ---- text ----
  { key: 'po', sql: 'i.po_number', type: 'text' },
  { key: 'design', sql: 'i.item_number', type: 'text' },
  { key: 'itemDescription', sql: 'i.item_description', type: 'text' },
  { key: 'type', sql: 'i.inspection_type', type: 'text' },
  { key: 'inspector', sql: 'i.inspector_name', type: 'text' },
  { key: 'merchandiser', sql: 'i.merchandiser_name', type: 'text' },
  { key: 'aql', sql: 'aqlMaster.description', type: 'text' },
  // Inspection document number — printable on the PDF, surfaced in the
  // grid, customer-facing reference. Same text ops as the other text
  // columns.
  { key: 'inspectionNumber', sql: 'i.inspection_number', type: 'text' },

  // ---- enum ----
  {
    key: 'result',
    sql: 'i.overall_result',
    type: 'enum',
    enumValues: ['PASS', 'FAIL', 'PENDING_REVIEW', 'REWORK', 'HOLD', 'COMMERCIAL_APPROVED', 'REJECTED'],
  },
  {
    key: 'sync',
    sql: 'i.sync_status',
    type: 'enum',
    enumValues: ['SYNCED', 'PENDING_SYNC', 'FAILED'],
  },
  {
    key: 'debitNote',
    sql: "i.debit_note->>'answer'",
    type: 'enum',
    enumValues: ['YES', 'NO'],
  },

  // ---- number ----
  { key: 'orderQty', sql: 'i.order_quantity', type: 'number' },
  { key: 'severity', sql: '(i.total_critical + i.total_major + i.total_minor)', type: 'number' },
  { key: 'critical', sql: 'i.total_critical', type: 'number' },
  { key: 'major', sql: 'i.total_major', type: 'number' },
  { key: 'minor', sql: 'i.total_minor', type: 'number' },

  // ---- date (ISO yyyy-mm-dd on `inspection_date` / `delivery_date`) ----
  { key: 'inspectionDate', sql: 'i.inspection_date', type: 'date' },
  { key: 'deliveryDate', sql: 'i.delivery_date', type: 'date' },
  // `when` is intentionally kept here as a deprecated alias so any
  // saved view / URL still pointing at the old "When" column doesn't
  // blow up — the date filter just maps onto `inspection_date`. New
  // code should target `inspectionDate` directly.

  // ---- FK join columns (filter by id via the multi-select dropdown) ----
  { key: 'category', sql: 'i.category_id', type: 'text', supportsTextOps: false },
  { key: 'supplier', sql: 'i.supplier_id', type: 'text', supportsTextOps: false },
];

const BY_KEY: Map<string, ColumnRule> = new Map(RULES.map((r) => [r.key, r]));

export function getColumnRule(key: string): ColumnRule | undefined {
  return BY_KEY.get(key);
}

/**
 * Escape a string for safe use inside a Postgres `ILIKE` pattern.
 * `%`, `_`, and `\` are wildcards; backslash-escape them so a user's
 * literal `_` doesn't match any character.
 */
function escapeIlike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Parse the `filters` URL param into a validated list. Silently
 * drops unknown column keys, unsupported operators, and enum values
 * outside the whitelist. Returns `[]` on any error.
 *
 * Text columns accept the full operator set: `contains`, `beginsWith`,
 * `endsWith`, `isExactly`, `oneOf` (array), `match` (regex).
 *
 * FK-backed columns (Category / Supplier) keep only the original
 * `contains` operator — the grid doesn't expose a per-column filter
 * for those, and admins filter via the toolbar dropdown instead.
 */
export function parseColumnFilters(raw: string | undefined): FilterEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: FilterEntry[] = [];
  for (const e of parsed) {
    if (!e || typeof e !== 'object') continue;
    const entry = e as Record<string, unknown>;
    const key = String(entry.columnKey ?? '');
    const op = String(entry.op ?? '') as FilterOp;
    if (!BY_KEY.has(key)) continue;
    const rule = BY_KEY.get(key)!;
    const allowedOps = ['contains', 'beginsWith', 'endsWith', 'isExactly', 'oneOf', 'match', 'eq', 'in', 'gte', 'lte', 'between'];
    if (!allowedOps.includes(op)) continue;

    // Normalise value
    let value: string | number | (string | number)[] | undefined = entry.value as any;
    let value2: string | number | undefined = entry.value2 as any;
    if (value === undefined || value === null) continue;

    // Enum columns — keep the original `eq` / `in` whitelist.
    if (rule.enumValues) {
      if (op === 'eq') {
        if (typeof value !== 'string' || !rule.enumValues.includes(value)) continue;
      } else if (op === 'in') {
        if (!Array.isArray(value)) continue;
        value = value.filter(
          (v): v is string => typeof v === 'string' && rule.enumValues!.includes(v),
        );
        if (value.length === 0) continue;
      } else {
        continue; // text ops + range ops not valid for enum
      }
    } else if (rule.type === 'text') {
      const supportsTextOps = rule.supportsTextOps !== false;
      if (op === 'contains') {
        if (typeof value !== 'string' || value.length === 0) continue;
      } else if (op === 'beginsWith') {
        if (!supportsTextOps || typeof value !== 'string' || value.length === 0) continue;
      } else if (op === 'endsWith') {
        if (!supportsTextOps || typeof value !== 'string' || value.length === 0) continue;
      } else if (op === 'isExactly') {
        if (!supportsTextOps || typeof value !== 'string' || value.length === 0) continue;
      } else if (op === 'oneOf') {
        if (!supportsTextOps || !Array.isArray(value)) continue;
        value = value.filter((v): v is string => typeof v === 'string' && v.length > 0);
        if (value.length === 0) continue;
      } else if (op === 'match') {
        if (!supportsTextOps || typeof value !== 'string' || value.length === 0) continue;
        // Validate the regex so a malformed pattern doesn't 500 the whole query.
        try {
          new RegExp(value);
        } catch {
          continue;
        }
      } else {
        // Number-style ops on a text column are meaningless — drop.
        continue;
      }
    } else if (rule.type === 'number') {
      if (op === 'contains') continue;
      if (op === 'between') {
        const lo = Number(value);
        const hi = Number(value2);
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
        value = lo; value2 = hi;
      } else if (op === 'in') {
        if (!Array.isArray(value)) continue;
        const nums = value.map(Number).filter((n) => Number.isFinite(n));
        if (nums.length === 0) continue;
        value = nums;
      } else {
        const n = Number(value);
        if (!Number.isFinite(n)) continue;
        value = n;
      }
    } else if (rule.type === 'date') {
      if (op === 'contains') continue;
      if (op === 'between') {
        if (typeof value !== 'string' || typeof value2 !== 'string') continue;
        if (value.length === 0 || value2.length === 0) continue;
      } else if (op === 'in') {
        continue; // date `in` doesn't make sense at the list level
      } else {
        if (typeof value !== 'string' || value.length === 0) continue;
      }
    }
    out.push({ columnKey: key, op, value: value as any, value2 });
  }
  return out;
}
