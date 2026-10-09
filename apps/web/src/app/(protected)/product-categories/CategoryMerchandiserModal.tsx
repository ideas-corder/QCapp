'use client';

import { useEffect, useMemo, useState } from 'react';
import { clientApiFetch } from '@/lib/api-client';

export interface MerchandiserOption {
  id: string;
  name: string;
  email: string;
  description: string | null;
  isActive: boolean;
}

interface CategorySummary {
  id: string;
  code: string;
  name: string;
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      message?: string | string[];
    };
    if (Array.isArray(body.message)) return body.message.join(' ');
    if (body.message) return body.message;
  } catch {
    // The generic status message below is enough for non-JSON responses.
  }
  return `Request failed (${response.status}).`;
}

export default function CategoryMerchandiserModal({
  category,
  onClose,
  onSaved,
}: {
  category: CategorySummary;
  onClose: () => void;
  onSaved: (merchandisers: MerchandiserOption[]) => void;
}) {
  const [merchandisers, setMerchandisers] = useState<MerchandiserOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [allResponse, assignedResponse] = await Promise.all([
          clientApiFetch('/merchandisers'),
          clientApiFetch(
            `/product-categories/${category.id}/merchandisers`,
          ),
        ]);

        if (!allResponse.ok) throw new Error(await responseMessage(allResponse));
        if (!assignedResponse.ok) {
          throw new Error(await responseMessage(assignedResponse));
        }

        const [all, assigned] = (await Promise.all([
          allResponse.json(),
          assignedResponse.json(),
        ])) as [MerchandiserOption[], MerchandiserOption[]];

        if (!cancelled) {
          setMerchandisers(
            [...all].sort((a, b) => a.name.localeCompare(b.name)),
          );
          setSelectedIds(new Set(assigned.map((item) => item.id)));
        }
      } catch (loadError: any) {
        if (!cancelled) {
          setError(loadError?.message ?? 'Unable to load merchandisers.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [category.id]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose, saving]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return merchandisers;
    return merchandisers.filter((item) =>
      `${item.name} ${item.email} ${item.description ?? ''}`
        .toLowerCase()
        .includes(term),
    );
  }, [merchandisers, search]);

  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await clientApiFetch(
        `/product-categories/${category.id}/merchandisers`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ merchandiserIds: [...selectedIds] }),
        },
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      const assigned = (await response.json()) as MerchandiserOption[];
      onSaved(assigned);
      onClose();
    } catch (saveError: any) {
      setError(saveError?.message ?? 'Unable to save assignments.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-merchandiser-title"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
          <div>
            <h2
              id="category-merchandiser-title"
              className="text-base font-semibold text-stone-900"
            >
              Assign merchandisers
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              {category.name}{' '}
              <span className="font-mono text-xs">({category.code})</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-xl leading-none text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-40"
          >
            ×
          </button>
        </header>

        <div className="border-b border-stone-200 bg-stone-50 px-5 py-3">
          <div className="flex items-center gap-3">
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email, or description…"
              className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-qc-500 focus:ring-2 focus:ring-qc-100"
            />
            <span className="whitespace-nowrap text-xs font-medium text-stone-600">
              {selectedIds.size} selected
            </span>
          </div>
        </div>

        <div className="min-h-[260px] flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex h-48 items-center justify-center text-sm text-stone-500">
              Loading merchandisers…
            </div>
          ) : merchandisers.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-stone-700">
                No merchandisers available
              </p>
              <p className="mt-1 text-xs text-stone-500">
                Create a merchandiser before assigning one to this category.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-stone-500">
              No merchandisers match your search.
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map((item) => {
                const selected = selectedIds.has(item.id);
                return (
                  <label
                    key={item.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      selected
                        ? 'border-qc-300 bg-qc-50'
                        : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggle(item.id)}
                      className="mt-1 h-4 w-4 rounded border-stone-300 text-qc-600 focus:ring-qc-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-stone-800">
                          {item.name}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            item.isActive
                              ? 'bg-accept-soft text-accept-deep'
                              : 'bg-stone-200 text-stone-600'
                          }`}
                        >
                          {item.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-stone-500">
                        {item.email}
                      </span>
                      {item.description && (
                        <span className="mt-1 block text-xs text-stone-500">
                          {item.description}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <div className="mx-5 mb-3 rounded-md border border-reject-border bg-reject-soft px-3 py-2 text-sm text-reject-deep">
            {error}
          </div>
        )}

        <footer className="flex items-center justify-between gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4">
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            disabled={loading || saving || selectedIds.size === 0}
            className="text-xs font-medium text-stone-600 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Remove all
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={loading || saving}
              className="rounded-md bg-qc-600 px-3 py-2 text-sm font-medium text-white hover:bg-qc-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save assignments'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
