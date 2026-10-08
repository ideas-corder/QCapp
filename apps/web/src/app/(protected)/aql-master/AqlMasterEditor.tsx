'use client';
import { useMemo, useState } from 'react';
import ImportSpreadsheetButton from '@/components/ImportSpreadsheetButton';
import { clientApiFetch } from '@/lib/api-client';

/** Send the user back to /login when the API rejects the request as 401. */

/** A single AQL sampling-plan bucket. */
interface AqlBucket {
  id: string;
  minQty: number;
  maxQty: number;
  sampleSize: number;
  description: string | null;
  isActive: boolean;
}

/**
 * The user-visible "Code" for a bucket is just `${minQty}-${maxQty}`.
 * The system auto-derives it; users never type it.
 */
function codeOf(b: { minQty: number; maxQty: number }): string {
  return `${b.minQty}-${b.maxQty}`;
}

type SortKey =
  | 'CODE_ASC'
  | 'CODE_DESC'
  | 'QTY_ASC'
  | 'QTY_DESC'
  | 'SAMPLE_ASC'
  | 'SAMPLE_DESC'
  | 'STATUS_ASC'
  | 'STATUS_DESC';

/** Strict integer validator — non-negative whole numbers only. */
function isValidInt(raw: string): boolean {
  if (raw === '' || raw == null) return true;
  return /^\d+$/.test(raw);
}

function parseInt0(raw: string): number {
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

export default function AqlMasterEditor({
  initial,
}: {
  initial: AqlBucket[];
}) {
  const [list, setList] = useState<AqlBucket[]>(initial);
  const [draft, setDraft] = useState({
    minQty: '',
    maxQty: '',
    sampleSize: '',
    description: '',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState(false);

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{
    minQty: string;
    maxQty: string;
    sampleSize: string;
    description: string;
    isActive: boolean;
  }>({
    minQty: '',
    maxQty: '',
    sampleSize: '',
    description: '',
    isActive: true,
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Filter / sort
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>(
    'ALL',
  );
  const [sortKey, setSortKey] = useState<SortKey>('QTY_ASC');

  // ---- numeric-input guards ----
  function onIntKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (['-', '+', 'e', 'E', '.', ',', ' '].includes(e.key)) {
      e.preventDefault();
    }
  }
  function onIntPaste(
    e: React.ClipboardEvent<HTMLInputElement>,
    setter: (v: string) => void,
  ) {
    const pasted = e.clipboardData.getData('text');
    if (!isValidInt(pasted)) {
      e.preventDefault();
      return;
    }
    // allow paste — replace with sanitized version
    e.preventDefault();
    setter(pasted);
  }

  async function create() {
    if (
      !isValidInt(draft.minQty) ||
      !isValidInt(draft.maxQty) ||
      !isValidInt(draft.sampleSize)
    )
      return;
    const minQty = parseInt0(draft.minQty);
    const maxQty = parseInt0(draft.maxQty);
    if (maxQty < minQty) {
      setCreateError(`maxQty (${maxQty}) must be ≥ minQty (${minQty})`);
      return;
    }
    const sampleSize = parseInt0(draft.sampleSize);
    if (sampleSize > maxQty) {
      setCreateError(
        `Inspect Qty (${sampleSize}) must be ≤ maxQty (${maxQty})`,
      );
      return;
    }

    setCreating(true);
    setCreateError(null);
    setCreateOk(false);
    try {
      const autoDesc = `Lot size ${minQty.toLocaleString()}\u2013${maxQty.toLocaleString()}`;
      const description = draft.description.trim() || autoDesc;
      const res = await clientApiFetch('/aql-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minQty,
          maxQty,
          sampleSize,
          description,
          isActive: true,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        setCreateError(`Save failed (${res.status}): ${txt.slice(0, 200)}`);
        return;
      }
      const created = (await res.json()) as AqlBucket;
      setList([...list, created].sort((a, b) => a.minQty - b.minQty));
      setDraft({
        minQty: '',
        maxQty: '',
        sampleSize: '',
        description: '',
      });
      setCreateOk(true);
      setTimeout(() => setCreateOk(false), 2000);
    } catch (e: any) {
      setCreateError(e?.message ?? 'Network error');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(b: AqlBucket) {
    setEditingId(b.id);
    setEdit({
      minQty: String(b.minQty),
      maxQty: String(b.maxQty),
      sampleSize: String(b.sampleSize),
      description: b.description ?? '',
      isActive: b.isActive,
    });
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(b: AqlBucket) {
    if (
      !isValidInt(edit.minQty) ||
      !isValidInt(edit.maxQty) ||
      !isValidInt(edit.sampleSize)
    ) {
      setEditError('All numeric fields must be non-negative integers');
      return;
    }
    const minQty = parseInt0(edit.minQty);
    const maxQty = parseInt0(edit.maxQty);
    if (maxQty < minQty) {
      setEditError(`maxQty (${maxQty}) must be ≥ minQty (${minQty})`);
      return;
    }
    const sampleSize = parseInt0(edit.sampleSize);
    if (sampleSize > maxQty) {
      setEditError(
        `Inspect Qty (${sampleSize}) must be ≤ maxQty (${maxQty})`,
      );
      return;
    }

    setEditSaving(true);
    setEditError(null);
    try {
      const autoDesc = `Lot size ${minQty.toLocaleString()}\u2013${maxQty.toLocaleString()}`;
      const description = edit.description.trim() || autoDesc;
      const res = await clientApiFetch(`/aql-master/${b.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minQty,
          maxQty,
          sampleSize,
          description,
          isActive: edit.isActive,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        setEditError(`Save failed (${res.status}): ${txt.slice(0, 200)}`);
        return;
      }
      const updated = (await res.json()) as AqlBucket;
      setList(list.map((x) => (x.id === b.id ? updated : x)));
      setEditingId(null);
    } catch (e: any) {
      setEditError(e?.message ?? 'Network error');
    } finally {
      setEditSaving(false);
    }
  }

  async function remove(b: AqlBucket) {
    if (
      !confirm(
        `Delete AQL bucket ${codeOf(b)}? This cannot be undone.`,
      )
    )
      return;
    const res = await clientApiFetch(`/aql-master/${b.id}`, {
      method: 'DELETE',
    });
    if (res.ok) setList(list.filter((x) => x.id !== b.id));
    else {
      const txt = await res.text();
      alert(`Delete failed (${res.status}): ${txt.slice(0, 200)}`);
    }
  }

  async function toggleActive(b: AqlBucket) {
    const res = await clientApiFetch(`/aql-master/${b.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !b.isActive }),
    });
    if (res.ok) {
      const updated = (await res.json()) as AqlBucket;
      setList(list.map((x) => (x.id === b.id ? updated : x)));
    }
  }

  // ---- derived list ----
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = list.filter((b) => {
      if (q) {
        const hay =
          `${codeOf(b)} ${b.description ?? ''} ${b.minQty} ${b.maxQty}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter === 'ACTIVE' && !b.isActive) return false;
      if (statusFilter === 'INACTIVE' && b.isActive) return false;
      return true;
    });
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'CODE_ASC':
          return codeOf(a).localeCompare(codeOf(b));
        case 'CODE_DESC':
          return codeOf(b).localeCompare(codeOf(a));
        case 'QTY_ASC':
          return a.minQty - b.minQty;
        case 'QTY_DESC':
          return b.minQty - a.minQty;
        case 'SAMPLE_ASC':
          return a.sampleSize - b.sampleSize;
        case 'SAMPLE_DESC':
          return b.sampleSize - a.sampleSize;
        case 'STATUS_ASC':
          return Number(a.isActive) - Number(b.isActive);
        case 'STATUS_DESC':
          return Number(b.isActive) - Number(a.isActive);
      }
    });
    return rows;
  }, [list, search, statusFilter, sortKey]);

  const activeFilters = (search ? 1 : 0) + (statusFilter !== 'ALL' ? 1 : 0);
  const isDefaultSort = sortKey === 'QTY_ASC';
  const canReset = activeFilters > 0 || !isDefaultSort;

  function resetFilters() {
    setSearch('');
    setStatusFilter('ALL');
    setSortKey('QTY_ASC');
  }

  function clickHeader(next: SortKey) {
    if (sortKey === next) {
      setSortKey('QTY_ASC');
    } else {
      setSortKey(next);
    }
  }

  function SortHeader({
    label,
    sortValue,
  }: {
    label: string;
    sortValue: SortKey;
  }) {
    const isActive = sortKey === sortValue;
    return (
      <button
        type="button"
        onClick={() => clickHeader(sortValue)}
        className="font-semibold text-stone-700 hover:text-qc-deep inline-flex items-center gap-1"
      >
        {label}
        <span className={isActive ? 'text-qc-deep' : 'text-stone-300'}>
          {isActive ? (sortKey.endsWith('_DESC') ? '↓' : '↑') : '↕'}
        </span>
      </button>
    );
  }

  // Live "Code" preview in the Add form
  const liveCode =
    isValidInt(draft.minQty) && isValidInt(draft.maxQty) && draft.maxQty
      ? `${parseInt0(draft.minQty) || 0}-${parseInt0(draft.maxQty) || 0}`
      : '—';

  return (
    <div className="space-y-4">
      {/* Add new */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-stone-700 mb-3">
          Add a new AQL bucket
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">
              Code
            </label>
            <div
              data-testid="aql-code-preview"
              className="w-full px-2 py-1.5 border rounded text-sm font-mono bg-stone-50 text-stone-700"
            >
              {liveCode}
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Auto-generated from Min / Max Qty.
            </p>
          </div>
          <div>
            <label
              htmlFor="aql-min"
              className="block text-xs font-medium text-stone-600 mb-1"
            >
              Min Qty <span className="text-red-500">*</span>
            </label>
            <input
              id="aql-min"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={9}
              placeholder="2"
              value={draft.minQty}
              onChange={(e) =>
                isValidInt(e.target.value) &&
                setDraft({ ...draft, minQty: e.target.value })
              }
              onKeyDown={onIntKeyDown}
              onPaste={(e) =>
                onIntPaste(e, (v) => setDraft({ ...draft, minQty: v }))
              }
              className="w-full px-2 py-1.5 border rounded text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="aql-max"
              className="block text-xs font-medium text-stone-600 mb-1"
            >
              Max Qty <span className="text-red-500">*</span>
            </label>
            <input
              id="aql-max"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={9}
              placeholder="8"
              value={draft.maxQty}
              onChange={(e) =>
                isValidInt(e.target.value) &&
                setDraft({ ...draft, maxQty: e.target.value })
              }
              onKeyDown={onIntKeyDown}
              onPaste={(e) =>
                onIntPaste(e, (v) => setDraft({ ...draft, maxQty: v }))
              }
              className="w-full px-2 py-1.5 border rounded text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="aql-inspect"
              className="block text-xs font-medium text-stone-600 mb-1"
            >
              Inspect Qty <span className="text-red-500">*</span>
              <span className="ml-1 text-[10px] text-stone-500">
                (sample size)
              </span>
            </label>
            <input
              id="aql-inspect"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="2"
              value={draft.sampleSize}
              onChange={(e) =>
                isValidInt(e.target.value) &&
                setDraft({ ...draft, sampleSize: e.target.value })
              }
              onKeyDown={onIntKeyDown}
              onPaste={(e) =>
                onIntPaste(e, (v) =>
                  setDraft({ ...draft, sampleSize: v }),
                )
              }
              className="w-full px-2 py-1.5 border rounded text-sm"
            />
          </div>

          <div className="md:col-span-2">
            <label
              htmlFor="aql-desc"
              className="block text-xs font-medium text-stone-600 mb-1"
            >
              Description
            </label>
            <input
              id="aql-desc"
              placeholder="Optional — human note (e.g. Lot size 2–8)"
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              className="w-full px-2 py-1.5 border rounded text-sm"
            />
          </div>

          <div className="md:col-span-4 flex items-end gap-2 flex-wrap">
            <button
              onClick={create}
              disabled={
                !draft.minQty ||
                !draft.maxQty ||
                !draft.sampleSize ||
                creating
              }
              className="bg-qc-strong hover:bg-qc-deep text-qc-on px-3 py-1.5 rounded text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {creating ? 'Saving…' : 'Add bucket'}
            </button>
            <ImportSpreadsheetButton
              label="Import CSV / Excel"
              endpoint="/aql-master/bulk-import"
              templateName="aql-master-template.csv"
              templateCsv={
                'minQty,maxQty,sampleSize,description,isActive\n' +
                '2,8,2,Lot size 2-8,true\n' +
                '9,15,3,Lot size 9-15,true\n' +
                '16,25,5,Lot size 16-25,true\n' +
                '26,50,8,Lot size 26-50,true\n' +
                '51,90,13,Lot size 51-90,true\n' +
                '91,150,20,Lot size 91-150,true\n' +
                '151,280,32,Lot size 151-280,true\n' +
                '281,500,50,Lot size 281-500,true\n' +
                '501,1200,80,Lot size 501-1200,true\n' +
                '1201,3200,125,Lot size 1201-3200,true\n' +
                '3201,10000,200,Lot size 3201-10000,true\n' +
                '10001,35000,315,Lot size 10001-35000,true\n' +
                '35001,150000,500,Lot size 35001-150000,true\n'
              }
              onImported={() => window.location.reload()}
            />
            {createOk && (
              <span className="text-xs px-2 py-1 rounded bg-accept-soft text-accept-deep border border-accept-border">
                Saved ✓
              </span>
            )}
            {createError && (
              <span
                className="text-xs px-2 py-1 rounded bg-reject-soft text-reject-deep border border-reject-border max-w-md truncate"
                title={createError}
              >
                {createError}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filter / sort */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label
              htmlFor="aql-search"
              className="block text-xs text-stone-500 mb-1"
            >
              Search
            </label>
            <div className="relative">
              <input
                id="aql-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Code (e.g. 151-280), qty range, or description…"
                className="w-full px-2 py-1.5 pr-7 border rounded text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs"
                  aria-label="Clear search"
                >
                  �
                </button>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="aql-status"
              className="block text-xs text-stone-500 mb-1"
            >
              Status
            </label>
            <select
              id="aql-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-2 py-1.5 border rounded text-sm"
            >
              <option value="ALL">All</option>
              <option value="ACTIVE">Active only</option>
              <option value="INACTIVE">Inactive only</option>
            </select>
          </div>

          <div>
            <label htmlFor="aql-sort" className="block text-xs text-stone-500 mb-1">
              Sort by
            </label>
            <select
              id="aql-sort"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="px-2 py-1.5 border rounded text-sm"
            >
              <option value="QTY_ASC">Qty range ascending</option>
              <option value="QTY_DESC">Qty range descending</option>
              <option value="CODE_ASC">Code ascending</option>
              <option value="CODE_DESC">Code descending</option>
              <option value="SAMPLE_ASC">Inspect Qty ascending</option>
              <option value="SAMPLE_DESC">Inspect Qty descending</option>
              <option value="STATUS_ASC">Status (inactive → active)</option>
              <option value="STATUS_DESC">Status (active → inactive)</option>
            </select>
          </div>

          {activeFilters > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-qc/15 text-qc-deep border border-qc/30">
              {activeFilters} filter{activeFilters === 1 ? '' : 's'}
            </span>
          )}

          <button
            type="button"
            onClick={resetFilters}
            disabled={!canReset}
            className="ml-auto px-3 py-1.5 text-xs rounded border border-stone-300 text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-stone-50 border-b grid grid-cols-12 gap-3 items-center text-sm">
          <div className="col-span-3">
            <SortHeader label="Code" sortValue="CODE_ASC" />
          </div>
          <div className="col-span-3">
            <SortHeader label="Lot size" sortValue="QTY_ASC" />
          </div>
          <div className="col-span-2 text-center">
            <SortHeader label="Inspect Qty" sortValue="SAMPLE_ASC" />
          </div>
          <div className="col-span-2">
            <SortHeader label="Status" sortValue="STATUS_ASC" />
          </div>
          <div className="col-span-2 text-right text-stone-500">Actions</div>
        </div>

        <div className="divide-y divide-stone-100">
          {visible.length === 0 && (
            <div className="p-8 text-center text-stone-400 text-sm">
              {list.length === 0
                ? 'No AQL buckets yet.'
                : 'No AQL buckets match the current filter.'}
            </div>
          )}
          {visible.map((b) =>
            editingId === b.id ? (
              <EditRow
                key={b.id}
                b={b}
                edit={edit}
                setEdit={setEdit}
                saving={editSaving}
                error={editError}
                onSave={() => saveEdit(b)}
                onCancel={cancelEdit}
                onIntKeyDown={onIntKeyDown}
                onIntPaste={onIntPaste}
              />
            ) : (
              <ReadRow
                key={b.id}
                b={b}
                onEdit={() => startEdit(b)}
                onDelete={() => remove(b)}
                onToggle={() => toggleActive(b)}
              />
            ),
          )}
        </div>

        <div className="p-3 text-sm text-stone-500 border-t bg-stone-50 flex items-center justify-between">
          <span>
            Showing {visible.length} of {list.length}
          </span>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-qc-deep hover:underline text-xs"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ActiveToggle({
  b,
  toggle,
}: {
  b: AqlBucket;
  toggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={toggle}
      className={`text-xs px-2 py-0.5 rounded ${
        b.isActive ? 'bg-accept-soft text-accept-deep' : 'bg-stone-200 text-stone-600'
      }`}
    >
      {b.isActive ? 'ACTIVE' : 'INACTIVE'}
    </button>
  );
}

function ReadRow({
  b,
  onEdit,
  onDelete,
  onToggle,
}: {
  b: AqlBucket;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const qtyRange = `Lot size ${b.minQty.toLocaleString()} – ${b.maxQty.toLocaleString()}`;
  return (
    <div className="px-4 py-3 grid grid-cols-12 gap-3 items-center text-sm">
      <div className="col-span-3 font-mono font-semibold text-stone-800 text-center">
        {codeOf(b)}
      </div>
      <div className="col-span-3 font-medium text-stone-800">
        <div className="text-[10px] font-mono text-stone-500 leading-tight">
          Code {codeOf(b)}
        </div>
        <div>{qtyRange}</div>
      </div>
      <div className="col-span-2 text-center font-medium">{b.sampleSize}</div>
      <div className="col-span-2">
        <ActiveToggle b={b} toggle={onToggle} />
      </div>
      <div className="col-span-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="text-xs px-2 py-1 rounded border border-stone-300 hover:bg-stone-50"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs px-2 py-1 rounded border border-reject-border text-reject-deep hover:bg-reject-soft"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function EditRow({
  b,
  edit,
  setEdit,
  saving,
  error,
  onSave,
  onCancel,
  onIntKeyDown,
  onIntPaste,
}: {
  b: AqlBucket;
  edit: {
    minQty: string;
    maxQty: string;
    sampleSize: string;
    description: string;
    isActive: boolean;
  };
  setEdit: (v: any) => void;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
  onIntKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onIntPaste: (
    e: React.ClipboardEvent<HTMLInputElement>,
    setter: (v: string) => void,
  ) => void;
}) {
  // Live code preview while editing
  const liveCode =
    edit.minQty && edit.maxQty
      ? `${parseInt0(edit.minQty)}-${parseInt0(edit.maxQty)}`
      : codeOf(b);

  return (
    <div className="px-4 py-3 bg-qc/10 border-l-4 border-qc">
      <div className="grid grid-cols-12 gap-3 items-start text-sm">
        <div className="col-span-2 font-mono font-semibold text-stone-800 text-center pt-1.5">
          {liveCode}
          <div className="text-[10px] text-stone-500 font-normal">
            (auto-derived)
          </div>
        </div>
        <div className="col-span-2 grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-stone-500 mb-0.5">Min</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={9}
              value={edit.minQty}
              onChange={(e) =>
                isValidInt(e.target.value) && setEdit({ ...edit, minQty: e.target.value })
              }
              onKeyDown={onIntKeyDown}
              onPaste={(e) => onIntPaste(e, (v) => setEdit({ ...edit, minQty: v }))}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] text-stone-500 mb-0.5">Max</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={9}
              value={edit.maxQty}
              onChange={(e) =>
                isValidInt(e.target.value) && setEdit({ ...edit, maxQty: e.target.value })
              }
              onKeyDown={onIntKeyDown}
              onPaste={(e) => onIntPaste(e, (v) => setEdit({ ...edit, maxQty: v }))}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] text-stone-500 mb-0.5">Inspect Qty</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={edit.sampleSize}
            onChange={(e) =>
              isValidInt(e.target.value) && setEdit({ ...edit, sampleSize: e.target.value })
            }
            onKeyDown={onIntKeyDown}
            onPaste={(e) => onIntPaste(e, (v) => setEdit({ ...edit, sampleSize: v }))}
            className="w-full px-2 py-1 border rounded text-sm text-center"
          />
        </div>
        <div className="col-span-3 flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={edit.isActive}
              onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })}
              id={`edit-active-${b.id}`}
            />
            <label
              htmlFor={`edit-active-${b.id}`}
              className="text-xs text-stone-600"
            >
              Active
            </label>
          </div>
          <input
            type="text"
            value={edit.description}
            onChange={(e) => setEdit({ ...edit, description: e.target.value })}
            placeholder="Description (optional)"
            className="w-full px-2 py-1 border rounded text-sm"
          />
        </div>
        <div className="col-span-3 flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="bg-qc-strong hover:bg-qc-deep text-qc-on px-3 py-1 rounded text-xs disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-2 py-1 rounded border border-stone-300 hover:bg-stone-50"
          >
            Cancel
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-2 text-xs text-reject-deep bg-reject-soft border border-reject-border rounded px-2 py-1">
          {error}
        </div>
      )}
    </div>
  );
}
