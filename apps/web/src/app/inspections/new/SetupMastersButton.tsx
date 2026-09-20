'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * One-click auto-seed for the master tables required by the New Inspection
 * form. When any of {product-categories, suppliers, inspectors,
 * inspection-types} is empty, the user sees a combined banner with this
 * button. Clicking it ensures each missing master has at least one active
 * row by either inserting a sensible default or reactivating an existing
 * inactive row that matches the default code, then reloads the page so the
 * form re-fetches the fresh option lists.
 *
 * Why this exists:
 *   Before this, hitting `/inspections/new` with no product categories /
 *   suppliers / inspectors / inspection types in the DB surfaced 4 stacked
 *   amber banners telling the user to go add rows manually. That felt like a
 *   permanent blocker to anyone setting up the platform for the first time.
 *   This component collapses those 4 banners into a single decisive action.
 *
 * Defaults are intentionally minimal (one row per missing master). Admins
 * are expected to edit/expand them through the dedicated admin pages later.
 *
 * Why the find-then-reactivate path matters:
 *   The `code` column on each master is unique across active AND inactive
 *   rows. If the user previously deactivated rows, a plain POST with the
 *   same code returns 409 Conflict. In that case we look up the existing
 *   inactive row by code and PUT it back to active, preserving the user's
 *   data instead of overwriting or duplicating it.
 */
type MasterKey = 'productCategories' | 'suppliers' | 'inspectors' | 'inspectionTypes';

const LABELS: Record<MasterKey, string> = {
  productCategories: 'product categories',
  suppliers: 'suppliers',
  inspectors: 'inspectors',
  inspectionTypes: 'inspection types',
};

type SeedDef = {
  listPath: string;       // GET list of rows (incl. inactive)
  createPath: string;     // POST new row
  matchCodeField: string; // which JSON field uniquely identifies the default
  matchCode: string;
  defaults: Record<string, unknown>;
};

function buildSeedDef(key: MasterKey): SeedDef {
  switch (key) {
    case 'productCategories':
      return {
        listPath: '/product-categories',
        createPath: '/product-categories',
        matchCodeField: 'code',
        matchCode: 'GENERAL',
        defaults: {
          code: 'GENERAL',
          name: 'General products',
          description: 'Auto-created default — edit / extend in Product Categories.',
          isActive: true,
        },
      };
    case 'suppliers':
      // VENDOR_ID_REGEX = /^VEN-\d{6}$/ — must be exactly 6 digits.
      return {
        listPath: '/suppliers',
        createPath: '/suppliers',
        matchCodeField: 'vendorId',
        matchCode: 'VEN-000001',
        defaults: {
          vendorId: 'VEN-000001',
          name: 'Default supplier',
          notes: 'Auto-created default — edit / extend in Suppliers.',
        },
      };
    case 'inspectors':
      return {
        listPath: '/inspectors',
        createPath: '/inspectors',
        matchCodeField: 'code',
        matchCode: 'INSP-001',
        defaults: {
          code: 'INSP-001',
          name: 'Default inspector',
          notes: 'Auto-created default — edit / extend in Inspectors.',
          isActive: true,
        },
      };
    case 'inspectionTypes':
      return {
        listPath: '/inspection-types',
        createPath: '/inspection-types',
        matchCodeField: 'code',
        matchCode: 'FINAL',
        defaults: {
          code: 'FINAL',
          label: 'Final inspection',
          description: 'Auto-created default — edit / extend in Inspection Types.',
          isActive: true,
        },
      };
  }
}

export function SetupMastersButton({ missing }: { missing: MasterKey[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ensureOne(key: MasterKey): Promise<{ ok: boolean; detail?: string }> {
    const def = buildSeedDef(key);
    // 1. List all rows (including inactive) so we can find an existing match.
    let list: any[] = [];
    try {
      const listRes = await fetch(`/api/backend${def.listPath}`, { headers: { 'Content-Type': 'application/json' } });
      if (listRes.ok) list = (await listRes.json()) as any[];
    } catch (e: any) {
      return { ok: false, detail: `list failed: ${e?.message ?? 'network'}` };
    }
    // 2. If there's any active row already, nothing to do.
    if (list.some((r) => r.isActive === true)) return { ok: true };
    // 3. If there's an inactive row matching the default code, reactivate it.
    const existing = list.find((r) => r[def.matchCodeField] === def.matchCode);
    if (existing) {
      try {
        const upd = await fetch(`/api/backend${def.createPath}/${existing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...existing, isActive: true }),
        });
        if (upd.ok) return { ok: true };
        return { ok: false, detail: `reactivate failed (${upd.status}): ${(await upd.text()).slice(0, 100)}` };
      } catch (e: any) {
        return { ok: false, detail: `reactivate network: ${e?.message ?? 'unknown'}` };
      }
    }
    // 4. Otherwise POST a new default row.
    try {
      const create = await fetch(`/api/backend${def.createPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(def.defaults),
      });
      if (create.ok) return { ok: true };
      return { ok: false, detail: `create failed (${create.status}): ${(await create.text()).slice(0, 100)}` };
    } catch (e: any) {
      return { ok: false, detail: `create network: ${e?.message ?? 'unknown'}` };
    }
  }

  async function seed() {
    if (running || missing.length === 0) return;
    setRunning(true);
    setError(null);
    setStatus('Setting up…');

    let done = 0;
    let failed = 0;
    let firstErr: string | null = null;

    for (const key of missing) {
      const r = await ensureOne(key);
      done += 1;
      if (r.ok) {
        setStatus(`Setting up… (${done} / ${missing.length}) ✓`);
      } else {
        failed += 1;
        if (r.detail && !firstErr) firstErr = `${LABELS[key]}: ${r.detail}`;
        setStatus(`Setting up… (${done} / ${missing.length}) ✗`);
      }
    }

    setRunning(false);
    if (failed === 0) {
      setStatus('All masters ready. Reloading…');
    } else {
      setError(firstErr);
      setStatus(`Set up ${done - failed} of ${missing.length}. Some could not be set up automatically — see message below.`);
    }

    // Reload after a brief pause so the user can read the status. Only
    // auto-reload when nothing failed — if there's an error, let the user
    // fix it manually first.
    setTimeout(() => {
      if (failed === 0) window.location.reload();
    }, 900);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={seed}
          disabled={running}
          className="px-4 py-2 bg-qc-strong hover:bg-qc-deep text-qc-on rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? 'Setting up…' : `Auto-create ${missing.length} default${missing.length === 1 ? '' : 's'}`}
        </button>
        <span className="text-xs text-amber-800">
          Adds one minimal row to each empty master so the form is immediately
          usable. Edit / extend them in the dedicated admin pages.
        </span>
      </div>
      {status && (
        <p className="text-xs text-amber-900">{status}</p>
      )}
      {error && (
        <p className="text-xs text-reject-deep">
          <span className="font-semibold">Could not auto-set up:</span> {error}
        </p>
      )}
    </div>
  );
}
