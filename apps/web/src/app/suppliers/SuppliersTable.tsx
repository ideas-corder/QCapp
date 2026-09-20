'use client';
import { useMemo, useState } from 'react';
import ImportCsvButton from '../../components/ImportCsvButton';

interface Supplier {
  id: string;
  vendorId: string | null;
  name: string;
  requireDoubleInspection: boolean;
  autoDebitNoteLimit: string;
  notes: string | null;
}

type DoubleFilter = 'ALL' | 'YES' | 'NO';
type SortKey = 'NAME_ASC' | 'NAME_DESC' | 'VENDOR_ASC' | 'VENDOR_DESC';

const VENDOR_ID_REGEX = /^VEN-\d{6}$/;

export default function SuppliersTable({ initial }: { initial: Supplier[] }) {
  const [list, setList] = useState<Supplier[]>(initial);
  const [draft, setDraft] = useState({
    vendorId: '',
    name: '',
    requireDoubleInspection: false,
    autoDebitNoteLimit: 0,
  });
  const [draftError, setDraftError] = useState<string | null>(null);

  // ---- filter / sort state ----
  const [search, setSearch] = useState('');
  const [double, setDouble] = useState<DoubleFilter>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('VENDOR_ASC');

  async function create() {
    setDraftError(null);
    const vendorId = draft.vendorId.trim().toUpperCase();
    if (!VENDOR_ID_REGEX.test(vendorId)) {
      setDraftError('Vendor ID must match VEN-XXXXXX (e.g. VEN-005036)');
      return;
    }
    if (!draft.name.trim()) return;
    const res = await fetch('/api/backend/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...draft, vendorId }),
    });
    if (res.ok) {
      const created: Supplier = await res.json();
      setList([...list, created]);
      setDraft({ ...draft, vendorId: '', name: '' });
    } else {
      const err = await res.json().catch(() => null);
      setDraftError(err?.message ?? 'Failed to create supplier');
    }
  }

  async function update(s: Supplier, patch: Partial<Supplier>) {
    if (patch.vendorId !== undefined && patch.vendorId !== null) {
      const normalized = patch.vendorId.trim().toUpperCase();
      if (!VENDOR_ID_REGEX.test(normalized)) {
        alert(`Invalid Vendor ID "${patch.vendorId}" — must be VEN-XXXXXX`);
        return;
      }
      patch.vendorId = normalized;
    }
    const res = await fetch(`/api/backend/suppliers/${s.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated: Supplier = await res.json();
      setList(list.map((x) => (x.id === s.id ? updated : x)));
    } else {
      const err = await res.json().catch(() => null);
      alert(err?.message ?? 'Update failed');
    }
  }

  // ---- derived list ----
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = list.filter((s) => {
      const hay = `${s.vendorId ?? ''} ${s.name} ${s.notes ?? ''}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (double === 'YES' && !s.requireDoubleInspection) return false;
      if (double === 'NO' && s.requireDoubleInspection) return false;
      return true;
    });
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'NAME_ASC':
          return a.name.localeCompare(b.name);
        case 'NAME_DESC':
          return b.name.localeCompare(a.name);
        case 'VENDOR_ASC':
          return (a.vendorId ?? '').localeCompare(b.vendorId ?? '');
        case 'VENDOR_DESC':
          return (b.vendorId ?? '').localeCompare(a.vendorId ?? '');
      }
    });
    return rows;
  }, [list, search, double, sortKey]);

  const activeCount = (search ? 1 : 0) + (double === 'ALL' ? 0 : 1);

  function resetFilters() {
    setSearch('');
    setDouble('ALL');
    setSortKey('VENDOR_ASC');
  }

  const isDefaultSort = sortKey === 'VENDOR_ASC';
  const canReset = activeCount > 0 || !isDefaultSort;

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-stone-700 mb-3">Add a new supplier</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label htmlFor="sup-vendor" className="block text-xs font-medium text-stone-600 mb-1">
              Vendor ID <span className="text-red-500">*</span>
              <span className="ml-1 text-stone-400 font-normal">(D365 F&O)</span>
            </label>
            <input
              id="sup-vendor"
              placeholder="VEN-005036"
              value={draft.vendorId}
              onChange={(e) => setDraft({ ...draft, vendorId: e.target.value.toUpperCase() })}
              maxLength={10}
              className="w-full px-2 py-1.5 border rounded text-sm font-mono"
            />
          </div>
          <div>
            <label htmlFor="sup-name" className="block text-xs font-medium text-stone-600 mb-1">
              Vendor name <span className="text-red-500">*</span>
            </label>
            <input
              id="sup-name"
              placeholder="e.g. Acme Manufacturing"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="w-full px-2 py-1.5 border rounded text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={draft.requireDoubleInspection}
              onChange={(e) =>
                setDraft({ ...draft, requireDoubleInspection: e.target.checked })
              }
            />
            Require double inspection
          </label>
          <div className="flex gap-2">
            <button
              onClick={create}
              disabled={!draft.name.trim() || !draft.vendorId.trim()}
              className="bg-qc-600 hover:bg-qc-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add supplier
            </button>
            <ImportCsvButton
              label="Import CSV"
              endpoint="/suppliers/bulk-import"
              templateName="suppliers-template.csv"
              templateCsv={
                'vendorId,name,requireDoubleInspection,autoDebitNoteLimit,notes\n' +
                'VEN-005001,Acme Manufacturing,false,0,Long-term partner\n' +
                'VEN-005002,Shenzhen Components,true,500,Requires double inspection\n' +
                'VEN-005003,Mumbai Textiles,false,250,Seasonal supplier\n'
              }
              onImported={() => window.location.reload()}
            />
          </div>
        </div>
        {draftError && (
          <p className="mt-2 text-xs text-red-600">{draftError}</p>
        )}
        <p className="mt-2 text-[11px] text-stone-400">
          Format: <span className="font-mono">VEN-XXXXXX</span> (e.g. <span className="font-mono">VEN-005036</span>) — must match the D365 F&amp;O vendor account.
        </p>
      </div>

      {/* Filter / sort bar */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="sup-search" className="block text-xs text-stone-500 mb-1">
              Search
            </label>
            <div className="relative">
              <input
                id="sup-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Vendor ID, name or notes…"
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
            <label className="block text-xs text-stone-500 mb-1">Double inspection</label>
            <select
              value={double}
              onChange={(e) => setDouble(e.target.value as DoubleFilter)}
              className="px-2 py-1.5 border rounded text-sm"
            >
              <option value="ALL">All</option>
              <option value="YES">Yes</option>
              <option value="NO">No</option>
            </select>
          </div>

          <div>
            <label htmlFor="sup-sort" className="block text-xs text-stone-500 mb-1">
              Sort by
            </label>
            <select
              id="sup-sort"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="px-2 py-1.5 border rounded text-sm"
            >
              <option value="VENDOR_ASC">Vendor ID ↑</option>
              <option value="VENDOR_DESC">Vendor ID ↓</option>
              <option value="NAME_ASC">Name A → Z</option>
              <option value="NAME_DESC">Name Z → A</option>
            </select>
          </div>

          {activeCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-qc-100 text-qc-800 border border-qc-200">
              {activeCount} filter{activeCount === 1 ? '' : 's'}
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
        <table className="w-full text-sm">
          <thead className="bg-stone-100 text-left">
            <tr>
              <th className="p-3">
                <button
                  type="button"
                  onClick={() => setSortKey(sortKey === 'VENDOR_ASC' ? 'VENDOR_DESC' : 'VENDOR_ASC')}
                  className="font-semibold text-stone-700 hover:text-qc-deep inline-flex items-center gap-1"
                >
                  Vendor ID
                  <span className="text-stone-400">
                    {sortKey === 'VENDOR_ASC' ? '↑' : sortKey === 'VENDOR_DESC' ? '↓' : ''}
                  </span>
                </button>
              </th>
              <th>
                <button
                  type="button"
                  onClick={() => setSortKey(sortKey === 'NAME_ASC' ? 'NAME_DESC' : 'NAME_ASC')}
                  className="font-semibold text-stone-700 hover:text-qc-deep inline-flex items-center gap-1"
                >
                  Name
                  <span className="text-stone-400">
                    {sortKey === 'NAME_ASC' ? '↑' : sortKey === 'NAME_DESC' ? '↓' : ''}
                  </span>
                </button>
              </th>
              <th>Double?</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="p-3">
                  <input
                    value={s.vendorId ?? ''}
                    onChange={(e) =>
                      update(s, { vendorId: e.target.value.toUpperCase() })
                    }
                    placeholder="VEN-000000"
                    maxLength={10}
                    className="w-28 px-2 py-1 border rounded text-sm font-mono"
                  />
                </td>
                <td className="font-medium">{s.name}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={s.requireDoubleInspection}
                    onChange={(e) =>
                      update(s, { requireDoubleInspection: e.target.checked })
                    }
                  />
                </td>
                <td>
                  <input
                    value={s.notes ?? ''}
                    onChange={(e) => update(s, { notes: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-sm"
                    placeholder="Add a note…"
                  />
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-stone-400">
                  {list.length === 0
                    ? 'No suppliers yet.'
                    : 'No suppliers match the current filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="p-3 text-sm text-stone-500 border-t bg-stone-50 flex items-center justify-between">
          <span>
            Showing {visible.length} of {list.length}
          </span>
          {activeCount > 0 && (
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
