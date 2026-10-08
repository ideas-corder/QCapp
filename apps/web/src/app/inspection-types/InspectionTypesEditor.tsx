'use client';
import { useMemo, useState } from 'react';
import ImportSpreadsheetButton from '../../components/ImportSpreadsheetButton';
import { clientApiFetch } from '@/lib/api-client';

interface InspectionType {
  id: string;
  code: string;
  label: string;
  description: string | null;
  isActive: boolean;
}

type SortKey = 'CODE_ASC' | 'CODE_DESC' | 'LABEL_ASC' | 'LABEL_DESC' | 'STATUS_ASC' | 'STATUS_DESC';

export default function InspectionTypesEditor({ initial }: { initial: InspectionType[] }) {
  const [list, setList] = useState<InspectionType[]>(initial);
  const [draft, setDraft] = useState({ code: '', label: '', description: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState(false);

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ label: '', description: '', isActive: true });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Filter / sort
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('CODE_ASC');

  async function create() {
    if (!draft.code.trim() || !draft.label.trim()) return;
    setCreating(true);
    setCreateError(null);
    setCreateOk(false);
    try {
      const res = await clientApiFetch('/inspection-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: draft.code.trim().toUpperCase(),
          label: draft.label.trim(),
          description: draft.description.trim() || null,
          isActive: true,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        setCreateError(`Save failed (${res.status}): ${txt.slice(0, 200)}`);
        return;
      }
      const created = (await res.json()) as InspectionType;
      setList([...list, created].sort((a, b) => a.code.localeCompare(b.code)));
      setDraft({ code: '', label: '', description: '' });
      setCreateOk(true);
      setTimeout(() => setCreateOk(false), 2000);
    } catch (e: any) {
      setCreateError(e?.message ?? 'Network error');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(t: InspectionType) {
    setEditingId(t.id);
    setEdit({
      label: t.label,
      description: t.description ?? '',
      isActive: t.isActive,
    });
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(t: InspectionType) {
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await clientApiFetch(`/inspection-types/${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: edit.label.trim(),
          description: edit.description.trim() || null,
          isActive: edit.isActive,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        setEditError(`Save failed (${res.status}): ${txt.slice(0, 200)}`);
        return;
      }
      const updated = (await res.json()) as InspectionType;
      setList(list.map((x) => (x.id === t.id ? updated : x)));
      setEditingId(null);
    } catch (e: any) {
      setEditError(e?.message ?? 'Network error');
    } finally {
      setEditSaving(false);
    }
  }

  async function remove(t: InspectionType) {
    if (!confirm(`Delete inspection type "${t.code}"? This cannot be undone.`))
      return;
    const res = await clientApiFetch(`/inspection-types/${t.id}`, {
      method: 'DELETE',
    });
    if (res.ok) setList(list.filter((x) => x.id !== t.id));
    else {
      const txt = await res.text();
      alert(`Delete failed (${res.status}): ${txt.slice(0, 200)}`);
    }
  }

  async function toggleActive(t: InspectionType) {
    const res = await clientApiFetch(`/inspection-types/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !t.isActive }),
    });
    if (res.ok) {
      const updated = (await res.json()) as InspectionType;
      setList(list.map((x) => (x.id === t.id ? updated : x)));
    }
  }

  // ---- derived list ----
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = list.filter((t) => {
      if (q) {
        const hay = `${t.code} ${t.label} ${t.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter === 'ACTIVE' && !t.isActive) return false;
      if (statusFilter === 'INACTIVE' && t.isActive) return false;
      return true;
    });
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'CODE_ASC':
          return a.code.localeCompare(b.code);
        case 'CODE_DESC':
          return b.code.localeCompare(a.code);
        case 'LABEL_ASC':
          return a.label.localeCompare(b.label);
        case 'LABEL_DESC':
          return b.label.localeCompare(a.label);
        case 'STATUS_ASC':
          return Number(a.isActive) - Number(b.isActive);
        case 'STATUS_DESC':
          return Number(b.isActive) - Number(a.isActive);
      }
    });
    return rows;
  }, [list, search, statusFilter, sortKey]);

  const activeFilters = (search ? 1 : 0) + (statusFilter !== 'ALL' ? 1 : 0);
  const isDefaultSort = sortKey === 'CODE_ASC';
  const canReset = activeFilters > 0 || !isDefaultSort;

  function resetFilters() {
    setSearch('');
    setStatusFilter('ALL');
    setSortKey('CODE_ASC');
  }

  function clickHeader(next: SortKey) {
    if (sortKey === next) {
      setSortKey('CODE_ASC');
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

  return (
    <div className="space-y-4">
      {/* Add new */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-stone-700 mb-3">
          Add a new inspection type
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label
              htmlFor="it-code"
              className="block text-xs font-medium text-stone-600 mb-1"
            >
              Code <span className="text-red-500">*</span>
            </label>
            <input
              id="it-code"
              placeholder="e.g. DUPRO"
              value={draft.code}
              onChange={(e) =>
                setDraft({ ...draft, code: e.target.value.toUpperCase() })
              }
              className="w-full px-2 py-1.5 border rounded text-sm font-mono"
              maxLength={32}
            />
            <p className="text-[11px] text-stone-500 mt-0.5">
              A–Z, 0–9, dash, underscore. Saved uppercase.
            </p>
          </div>
          <div>
            <label
              htmlFor="it-label"
              className="block text-xs font-medium text-stone-600 mb-1"
            >
              Label <span className="text-red-500">*</span>
            </label>
            <input
              id="it-label"
              placeholder="e.g. During Production Check"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              className="w-full px-2 py-1.5 border rounded text-sm"
              maxLength={255}
            />
          </div>
          <div>
            <label
              htmlFor="it-desc"
              className="block text-xs font-medium text-stone-600 mb-1"
            >
              Description
            </label>
            <input
              id="it-desc"
              placeholder="Optional — what this type means"
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              className="w-full px-2 py-1.5 border rounded text-sm"
            />
          </div>
          <div className="md:col-span-3 flex items-end gap-2 flex-wrap">
            <button
              onClick={create}
              disabled={
                !draft.code.trim() || !draft.label.trim() || creating
              }
              className="bg-qc-600 hover:bg-qc-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {creating ? 'Saving…' : 'Add type'}
            </button>
            <ImportSpreadsheetButton
              label="Import CSV / Excel"
              endpoint="/inspection-types/bulk-import"
              templateName="inspection-types-template.csv"
              templateCsv={
                'code,label,description,isActive\n' +
                'INLINE,Inline inspection,Inspection performed during production,true\n' +
                'FINAL,Final inspection,Pre-shipment inspection of finished lot,true\n' +
                'DUPRO,During Production,Dupro check mid-run,true\n'
              }
              onImported={() => window.location.reload()}
            />
            {createOk && (
              <span className="text-xs px-2 py-1 rounded bg-accept-soft text-accept-deep border border-green-200">
                Saved ✓
              </span>
            )}
            {createError && (
              <span
                className="text-xs px-2 py-1 rounded bg-reject-soft text-reject-deep border border-red-200 max-w-md truncate"
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
              htmlFor="it-search"
              className="block text-xs text-stone-500 mb-1"
            >
              Search
            </label>
            <div className="relative">
              <input
                id="it-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Code, label, or description…"
                className="w-full px-2 py-1.5 pr-7 border rounded text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="it-status"
              className="block text-xs text-stone-500 mb-1"
            >
              Status
            </label>
            <select
              id="it-status"
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
            <label htmlFor="it-sort" className="block text-xs text-stone-500 mb-1">
              Sort by
            </label>
            <select
              id="it-sort"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="px-2 py-1.5 border rounded text-sm"
            >
              <option value="CODE_ASC">Code A → Z</option>
              <option value="CODE_DESC">Code Z → A</option>
              <option value="LABEL_ASC">Label A → Z</option>
              <option value="LABEL_DESC">Label Z → A</option>
              <option value="STATUS_ASC">Status (inactive → active)</option>
              <option value="STATUS_DESC">Status (active → inactive)</option>
            </select>
          </div>

          {activeFilters > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-qc-100 text-qc-800 border border-qc-200">
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
        <div className="px-4 py-3 bg-stone-50 border-b flex flex-wrap items-center gap-3 text-sm">
          <div className="w-32">
            <SortHeader label="Code" sortValue="CODE_ASC" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <SortHeader label="Label" sortValue="LABEL_ASC" />
          </div>
          <div className="w-32">
            <SortHeader label="Status" sortValue="STATUS_ASC" />
          </div>
          <div className="w-32 text-right text-stone-500">Actions</div>
        </div>

        <div className="divide-y divide-stone-100">
          {visible.length === 0 && (
            <div className="p-8 text-center text-stone-400 text-sm">
              {list.length === 0
                ? 'No inspection types yet.'
                : 'No inspection types match the current filter.'}
            </div>
          )}
          {visible.map((t) =>
            editingId === t.id ? (
              <EditRow
                key={t.id}
                t={t}
                edit={edit}
                setEdit={setEdit}
                saving={editSaving}
                error={editError}
                onSave={() => saveEdit(t)}
                onCancel={cancelEdit}
              />
            ) : (
              <ReadRow
                key={t.id}
                t={t}
                onEdit={() => startEdit(t)}
                onDelete={() => remove(t)}
                onToggle={() => toggleActive(t)}
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
  t,
  toggle,
}: {
  t: InspectionType;
  toggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={toggle}
      className={`text-xs px-2 py-0.5 rounded ${
        t.isActive ? 'bg-accept-soft text-accept-deep' : 'bg-stone-200 text-stone-600'
      }`}
    >
      {t.isActive ? 'ACTIVE' : 'INACTIVE'}
    </button>
  );
}

function ReadRow({
  t,
  onEdit,
  onDelete,
  onToggle,
}: {
  t: InspectionType;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="px-4 py-3 flex items-center gap-3 text-sm">
      <div className="w-32 font-mono font-semibold text-stone-800">{t.code}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-stone-800">{t.label}</div>
        {t.description && (
          <div className="text-xs text-stone-500 truncate">{t.description}</div>
        )}
      </div>
      <div className="w-32">
        <ActiveToggle t={t} toggle={onToggle} />
      </div>
      <div className="w-32 flex justify-end gap-2">
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
  t,
  edit,
  setEdit,
  saving,
  error,
  onSave,
  onCancel,
}: {
  t: InspectionType;
  edit: { label: string; description: string; isActive: boolean };
  setEdit: (v: { label: string; description: string; isActive: boolean }) => void;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="px-4 py-3 bg-qc-soft/40 border-l-4 border-qc-500">
      <div className="flex items-center gap-3 text-sm">
        <div className="w-32 font-mono font-semibold text-stone-800">{t.code}</div>
        <div className="flex-1 min-w-0 space-y-2">
          <input
            value={edit.label}
            onChange={(e) => setEdit({ ...edit, label: e.target.value })}
            placeholder="Label"
            className="w-full px-2 py-1 border rounded text-sm"
            maxLength={255}
          />
          <input
            value={edit.description}
            onChange={(e) => setEdit({ ...edit, description: e.target.value })}
            placeholder="Description (optional)"
            className="w-full px-2 py-1 border rounded text-sm"
          />
        </div>
        <div className="w-32">
          <label className="flex items-center gap-2 text-xs text-stone-600">
            <input
              type="checkbox"
              checked={edit.isActive}
              onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })}
            />
            Active
          </label>
        </div>
        <div className="w-32 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-xs px-2 py-1 rounded border border-stone-300 hover:bg-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!edit.label.trim() || saving}
            className="text-xs px-2 py-1 rounded bg-qc-600 text-white hover:bg-qc-700 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
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
