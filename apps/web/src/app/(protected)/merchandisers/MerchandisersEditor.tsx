'use client';

import { FormEvent, useMemo, useState } from 'react';
import { clientApiFetch } from '@/lib/api-client';

export interface Merchandiser {
  id: string;
  name: string;
  email: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type SortKey =
  | 'CREATED_DESC'
  | 'CREATED_ASC'
  | 'NAME_ASC'
  | 'NAME_DESC'
  | 'STATUS_DESC';

type MerchandiserForm = {
  name: string;
  email: string;
  description: string;
  isActive: boolean;
};

const EMPTY_FORM: MerchandiserForm = {
  name: '',
  email: '',
  description: '',
  isActive: true,
};

async function apiError(response: Response): Promise<string> {
  const fallback = `Request failed (${response.status})`;
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join('. ');
    return body.message || fallback;
  } catch {
    return fallback;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

export default function MerchandisersEditor({ initial }: { initial: Merchandiser[] }) {
  const [list, setList] = useState(initial);
  const [draft, setDraft] = useState<MerchandiserForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<MerchandiserForm>(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('CREATED_DESC');

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.email.trim()) return;
    setCreating(true);
    setCreateError(null);
    setCreateOk(false);
    try {
      const response = await clientApiFetch('/merchandisers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name.trim(),
          email: draft.email.trim().toLowerCase(),
          description: draft.description.trim() || null,
          isActive: draft.isActive,
        }),
      });
      if (!response.ok) {
        setCreateError(await apiError(response));
        return;
      }
      const created = (await response.json()) as Merchandiser;
      setList((current) => [created, ...current]);
      setDraft(EMPTY_FORM);
      setCreateOk(true);
      window.setTimeout(() => setCreateOk(false), 2000);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Unable to create merchandiser.');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(item: Merchandiser) {
    setEditingId(item.id);
    setEdit({
      name: item.name,
      email: item.email,
      description: item.description ?? '',
      isActive: item.isActive,
    });
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(item: Merchandiser) {
    if (!edit.name.trim() || !edit.email.trim()) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const response = await clientApiFetch(`/merchandisers/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: edit.name.trim(),
          email: edit.email.trim().toLowerCase(),
          description: edit.description.trim() || null,
          isActive: edit.isActive,
        }),
      });
      if (!response.ok) {
        setEditError(await apiError(response));
        return;
      }
      const updated = (await response.json()) as Merchandiser;
      setList((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setEditingId(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Unable to update merchandiser.');
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(item: Merchandiser) {
    setTogglingId(item.id);
    try {
      const response = await clientApiFetch(`/merchandisers/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      if (!response.ok) {
        window.alert(await apiError(response));
        return;
      }
      const updated = (await response.json()) as Merchandiser;
      setList((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    } finally {
      setTogglingId(null);
    }
  }

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = list.filter((item) => {
      if (statusFilter === 'ACTIVE' && !item.isActive) return false;
      if (statusFilter === 'INACTIVE' && item.isActive) return false;
      if (!query) return true;
      return `${item.name} ${item.email} ${item.description ?? ''}`
        .toLowerCase()
        .includes(query);
    });

    rows.sort((a, b) => {
      switch (sortKey) {
        case 'CREATED_ASC':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'NAME_ASC':
          return a.name.localeCompare(b.name);
        case 'NAME_DESC':
          return b.name.localeCompare(a.name);
        case 'STATUS_DESC':
          return Number(b.isActive) - Number(a.isActive);
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
    return rows;
  }, [list, search, statusFilter, sortKey]);

  const activeFilters = (search.trim() ? 1 : 0) + (statusFilter !== 'ALL' ? 1 : 0);

  function resetFilters() {
    setSearch('');
    setStatusFilter('ALL');
    setSortKey('CREATED_DESC');
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-stone-700">Add a new merchandiser</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Name" htmlFor="m-name" required>
            <input id="m-name" required maxLength={255} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Ayesha Khan" className="w-full rounded border px-2 py-1.5 text-sm" />
          </Field>
          <Field label="Email" htmlFor="m-email" required>
            <input id="m-email" type="email" required maxLength={255} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="ayesha@example.com" className="w-full rounded border px-2 py-1.5 text-sm" />
          </Field>
          <div className="md:col-span-2">
            <Field label="Description" htmlFor="m-description">
              <input id="m-description" maxLength={2000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Optional — department, region, or responsibilities" className="w-full rounded border px-2 py-1.5 text-sm" />
            </Field>
          </div>
          <div className="md:col-span-2 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={creating || !draft.name.trim() || !draft.email.trim()} className="rounded bg-qc-600 px-3 py-1.5 text-sm text-white hover:bg-qc-700 disabled:cursor-not-allowed disabled:opacity-40">
              {creating ? 'Saving…' : 'Add merchandiser'}
            </button>
            {createOk && <span className="rounded border border-accept-border bg-accept-soft px-2 py-1 text-xs text-accept-deep">Saved ✓</span>}
            {createError && <span className="max-w-xl rounded border border-reject-border bg-reject-soft px-2 py-1 text-xs text-reject-deep">{createError}</span>}
          </div>
        </div>
      </form>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Search" htmlFor="m-search" className="min-w-[220px] flex-1">
            <input id="m-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, or description…" className="w-full rounded border px-2 py-1.5 text-sm" />
          </Field>
          <Field label="Status" htmlFor="m-status">
            <select id="m-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="rounded border px-2 py-1.5 text-sm">
              <option value="ALL">All</option><option value="ACTIVE">Active only</option><option value="INACTIVE">Inactive only</option>
            </select>
          </Field>
          <Field label="Sort by" htmlFor="m-sort">
            <select id="m-sort" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className="rounded border px-2 py-1.5 text-sm">
              <option value="CREATED_DESC">Newest first</option><option value="CREATED_ASC">Oldest first</option><option value="NAME_ASC">Name A → Z</option><option value="NAME_DESC">Name Z → A</option><option value="STATUS_DESC">Active first</option>
            </select>
          </Field>
          {activeFilters > 0 && <span className="rounded-full border border-qc-200 bg-qc-100 px-2 py-0.5 text-xs font-medium text-qc-800">{activeFilters} filter{activeFilters === 1 ? '' : 's'}</span>}
          <button type="button" onClick={resetFilters} className="ml-auto rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50">Reset</button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-[minmax(180px,1fr)_minmax(210px,1fr)_110px_120px_150px] gap-3 border-b bg-stone-50 px-4 py-3 text-xs font-semibold text-stone-600">
              <span>Name</span><span>Email / description</span><span>Created</span><span>Status</span><span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-stone-100">
              {visible.map((item) => editingId === item.id ? (
                <EditRow key={item.id} item={item} value={edit} setValue={setEdit} saving={editSaving} error={editError} onSave={() => saveEdit(item)} onCancel={cancelEdit} />
              ) : (
                <ReadRow key={item.id} item={item} toggling={togglingId === item.id} onEdit={() => startEdit(item)} onToggle={() => toggleActive(item)} />
              ))}
              {visible.length === 0 && <div className="p-8 text-center text-sm text-stone-400">{list.length === 0 ? 'No merchandisers yet.' : 'No merchandisers match the current filters.'}</div>}
            </div>
          </div>
        </div>
        <footer className="flex items-center justify-between border-t bg-stone-50 p-3 text-sm text-stone-500">
          <span>Showing {visible.length} of {list.length}</span>
          {activeFilters > 0 && <button type="button" onClick={resetFilters} className="text-xs text-qc-deep hover:underline">Clear filters</button>}
        </footer>
      </section>
    </div>
  );
}

function ReadRow({ item, toggling, onEdit, onToggle }: { item: Merchandiser; toggling: boolean; onEdit: () => void; onToggle: () => void }) {
  return (
    <div className="grid grid-cols-[minmax(180px,1fr)_minmax(210px,1fr)_110px_120px_150px] items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 font-medium text-stone-800">{item.name}</div>
      <div className="min-w-0"><a href={`mailto:${item.email}`} className="block truncate text-xs text-qc-deep hover:underline">{item.email}</a><div className="truncate text-xs text-stone-500">{item.description || '—'}</div></div>
      <div className="text-xs text-stone-500">{formatDate(item.createdAt)}</div>
      <div><StatusBadge active={item.isActive} /></div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onEdit} className="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50">Edit</button>
        <button type="button" onClick={onToggle} disabled={toggling} className="min-w-[76px] rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50 disabled:opacity-40">{toggling ? 'Saving…' : item.isActive ? 'Deactivate' : 'Activate'}</button>
      </div>
    </div>
  );
}

function EditRow({ item, value, setValue, saving, error, onSave, onCancel }: { item: Merchandiser; value: MerchandiserForm; setValue: (value: MerchandiserForm) => void; saving: boolean; error: string | null; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="border-l-4 border-qc-500 bg-qc-soft/40 px-4 py-3">
      <div className="grid grid-cols-[minmax(180px,1fr)_minmax(210px,1fr)_110px_120px_150px] items-start gap-3 text-sm">
        <input value={value.name} onChange={(event) => setValue({ ...value, name: event.target.value })} maxLength={255} placeholder="Name" className="rounded border px-2 py-1.5 text-sm" />
        <div className="space-y-2"><input type="email" value={value.email} onChange={(event) => setValue({ ...value, email: event.target.value })} maxLength={255} placeholder="Email" className="w-full rounded border px-2 py-1.5 text-sm" /><input value={value.description} onChange={(event) => setValue({ ...value, description: event.target.value })} maxLength={2000} placeholder="Description (optional)" className="w-full rounded border px-2 py-1.5 text-sm" /></div>
        <div className="pt-2 text-xs text-stone-500">{formatDate(item.createdAt)}</div>
        <label className="flex items-center gap-2 pt-2 text-xs text-stone-600"><input type="checkbox" checked={value.isActive} onChange={(event) => setValue({ ...value, isActive: event.target.checked })} /> Active</label>
        <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={onSave} disabled={saving || !value.name.trim() || !value.email.trim()} className="rounded bg-qc-600 px-2 py-1 text-xs text-white hover:bg-qc-700 disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button><button type="button" onClick={onCancel} disabled={saving} className="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50">Cancel</button></div>
      </div>
      {error && <div className="mt-2 rounded border border-reject-border bg-reject-soft px-2 py-1 text-xs text-reject-deep">{error}</div>}
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return <span className={`rounded px-2 py-0.5 text-xs ${active ? 'bg-accept-soft text-accept-deep' : 'bg-stone-200 text-stone-600'}`}>{active ? 'ACTIVE' : 'INACTIVE'}</span>;
}

function Field({ label, htmlFor, required, className = '', children }: { label: string; htmlFor: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return <div className={className}><label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-stone-600">{label}{required && <span className="ml-0.5 text-red-500">*</span>}</label>{children}</div>;
}
