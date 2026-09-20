'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

function handleAuthError(status: number, router: ReturnType<typeof useRouter>) {
  if (status === 401) {
    router.replace('/login?expired=1');
    return true;
  }
  return false;
}

export interface UserView {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'inspector' | 'viewer';
  isActive: boolean;
  isSuperAdmin: boolean;
  mfaEnabled: boolean;
  uiLayout: 'modern' | 'classic';
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type Caller = {
  userId: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
};

type SortKey =
  | 'EMAIL_ASC'
  | 'EMAIL_DESC'
  | 'NAME_ASC'
  | 'NAME_DESC'
  | 'ROLE_ASC'
  | 'ROLE_DESC'
  | 'STATUS_ASC'
  | 'STATUS_DESC'
  | 'LAST_LOGIN_DESC'
  | 'LAST_LOGIN_ASC';

const ROLE_LABEL: Record<UserView['role'], string> = {
  admin: 'Admin',
  inspector: 'Inspector',
  viewer: 'Viewer',
};

/**
 * The Users master editor. Mirrors the InspectorsEditor pattern
 * (table view + add-new card + filter/sort + inline edit rows) but
 * with three users-master-specific rules baked into the UI:
 *
 *   1. The bootstrap super-admin row gets a lock badge + a tooltip
 *      explaining it cannot be edited from this screen.
 *   2. The caller's own row gets a "you" badge + all action buttons
 *      disabled (defence-in-depth; the API also rejects these
 *      calls but the UI should not even offer them).
 *   3. Reset-password opens a separate modal that asks for the
 *      new password twice — both must match before the call goes
 *      out — so a fat-fingered admin doesn't lock someone out.
 */
export default function UsersEditor({
  initial,
  caller,
}: {
  initial: UserView[];
  caller: Caller;
}) {
  const router = useRouter();
  const [list, setList] = useState<UserView[]>(initial);
  const [draft, setDraft] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    role: 'inspector' as UserView['role'],
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState(false);

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{
    fullName: string;
    email: string;
    role: UserView['role'];
    isActive: boolean;
  }>({ fullName: '', email: '', role: 'inspector', isActive: true });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Reset password modal
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPwd, setResetPwd] = useState('');
  const [resetPwd2, setResetPwd2] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSaving, setResetSaving] = useState(false);
  const [resetOk, setResetOk] = useState(false);

  // Filter / sort
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'ACTIVE' | 'INACTIVE'
  >('ALL');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserView['role']>(
    'ALL',
  );
  const [sortKey, setSortKey] = useState<SortKey>('EMAIL_ASC');

  // Lightweight RFC-ish email check that matches the API's IsEmail()
  // validator so users get a friendly inline error before the request
  // goes out (instead of a raw "email must be an email" 400 dump).
  function isValidEmail(value: string): boolean {
    const v = value.trim();
    // at least one char, then '@', then at least one char, then '.',
    // then at least one char — no whitespace, no commas.
    return /^[^\s@]+@[^\s@,]+\.[^\s@,]+$/.test(v);
  }

  function prettyApiError(status: number, raw: string): string {
    // The API returns `{ message: string | string[], statusCode, error }`.
    // `class-validator` failures come back as `message: ["email must be an email", ...]`.
    try {
      const parsed = JSON.parse(raw) as {
        message?: string | string[];
        error?: string;
      };
      const msgs = Array.isArray(parsed.message)
        ? parsed.message
        : parsed.message
          ? [parsed.message]
          : [];
      if (msgs.length === 0) return `Save failed (${status})`;
      // Translate the most common class-validator sentences into English.
      const translated = msgs.map((m) => {
        const lower = String(m).toLowerCase();
        if (lower.includes('email must be an email'))
          return 'Please enter a valid email address.';
        if (lower.includes('password must be longer than'))
          return 'Password must be at least 8 characters.';
        if (lower.includes('fullname must be longer than'))
          return 'Full name must be at least 2 characters.';
        if (lower.includes('role must be one of'))
          return 'Selected role is not allowed.';
        return String(m);
      });
      return `Save failed (${status}): ${translated.join(' ')}`;
    } catch {
      return `Save failed (${status}): ${raw.slice(0, 200)}`;
    }
  }

  async function create() {
    if (
      !draft.email.trim() ||
      !draft.password ||
      !draft.fullName.trim()
    ) {
      return;
    }
    if (!isValidEmail(draft.email)) {
      setCreateError('Please enter a valid email address.');
      return;
    }
    if (draft.password !== draft.confirmPassword) {
      setCreateError('Passwords do not match.');
      return;
    }
    if (draft.password.length < 8) {
      setCreateError('Password must be at least 8 characters.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    setCreateOk(false);
    try {
      const res = await fetch('/api/backend/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: draft.email.trim().toLowerCase(),
          password: draft.password,
          fullName: draft.fullName.trim(),
          role: draft.role,
          isActive: true,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        if (handleAuthError(res.status, router)) return;
        setCreateError(prettyApiError(res.status, txt));
        return;
      }
      const created = (await res.json()) as UserView;
      setList(
        [...list, created].sort((a, b) => a.email.localeCompare(b.email)),
      );
      setDraft({
        email: '',
        password: '',
        confirmPassword: '',
        fullName: '',
        role: 'inspector',
      });
      setCreateOk(true);
      setTimeout(() => setCreateOk(false), 2000);
    } catch (e: any) {
      setCreateError(e?.message ?? 'Network error');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(u: UserView) {
    setEditingId(u.id);
    setEdit({
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
    });
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(u: UserView) {
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/backend/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: edit.fullName.trim(),
          email: edit.email.trim().toLowerCase(),
          role: edit.role,
          isActive: edit.isActive,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        if (handleAuthError(res.status, router)) return;
        setEditError(prettyApiError(res.status, txt));
        return;
      }
      const updated = (await res.json()) as UserView;
      setList(list.map((x) => (x.id === u.id ? updated : x)));
      setEditingId(null);
    } catch (e: any) {
      setEditError(e?.message ?? 'Network error');
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(u: UserView) {
    const next = !u.isActive;
    if (!confirm(
      next
        ? `Re-activate ${u.email}? They will be able to log in again.`
        : `Deactivate ${u.email}? They will no longer be able to log in. Past inspections still resolve to this account.`,
    )) {
      return;
    }
    const res = await fetch(`/api/backend/users/${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: next }),
    });
    if (res.ok) {
      const updated = (await res.json()) as UserView;
      setList(list.map((x) => (x.id === u.id ? updated : x)));
    } else if (res.status === 401) {
      handleAuthError(res.status, router);
    } else {
      const txt = await res.text();
      alert(`Failed (${res.status}): ${txt.slice(0, 200)}`);
    }
  }

  function openReset(u: UserView) {
    setResetId(u.id);
    setResetPwd('');
    setResetPwd2('');
    setResetError(null);
    setResetOk(false);
  }

  function cancelReset() {
    setResetId(null);
    setResetPwd('');
    setResetPwd2('');
    setResetError(null);
    setResetOk(false);
  }

  async function submitReset(u: UserView) {
    if (resetPwd.length < 8) {
      setResetError('Password must be at least 8 characters.');
      return;
    }
    if (resetPwd !== resetPwd2) {
      setResetError('Passwords do not match.');
      return;
    }
    setResetSaving(true);
    setResetError(null);
    setResetOk(false);
    try {
      const res = await fetch(`/api/backend/users/${u.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: resetPwd }),
      });
      if (!res.ok) {
        const txt = await res.text();
        if (handleAuthError(res.status, router)) return;
        setResetError(prettyApiError(res.status, txt));
        return;
      }
      // Brief in-modal confirmation, then close.
      setResetOk(true);
      setTimeout(() => cancelReset(), 1200);
    } catch (e: any) {
      setResetError(e?.message ?? 'Network error');
    } finally {
      setResetSaving(false);
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = list.filter((u) => {
      if (q) {
        const hay = `${u.email} ${u.fullName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter === 'ACTIVE' && !u.isActive) return false;
      if (statusFilter === 'INACTIVE' && u.isActive) return false;
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      return true;
    });
    rows.sort((a, b) => {
      switch (sortKey) {
        case 'EMAIL_ASC':
          return a.email.localeCompare(b.email);
        case 'EMAIL_DESC':
          return b.email.localeCompare(a.email);
        case 'NAME_ASC':
          return a.fullName.localeCompare(b.fullName);
        case 'NAME_DESC':
          return b.fullName.localeCompare(a.fullName);
        case 'ROLE_ASC':
          return a.role.localeCompare(b.role);
        case 'ROLE_DESC':
          return b.role.localeCompare(a.role);
        case 'STATUS_ASC':
          return Number(a.isActive) - Number(b.isActive);
        case 'STATUS_DESC':
          return Number(b.isActive) - Number(a.isActive);
        case 'LAST_LOGIN_DESC':
          return (
            new Date(b.lastLoginAt ?? 0).getTime() -
            new Date(a.lastLoginAt ?? 0).getTime()
          );
        case 'LAST_LOGIN_ASC':
          return (
            new Date(a.lastLoginAt ?? 0).getTime() -
            new Date(b.lastLoginAt ?? 0).getTime()
          );
      }
    });
    return rows;
  }, [list, search, statusFilter, roleFilter, sortKey]);

  const activeFilters =
    (search ? 1 : 0) +
    (statusFilter !== 'ALL' ? 1 : 0) +
    (roleFilter !== 'ALL' ? 1 : 0);
  const isDefaultSort = sortKey === 'EMAIL_ASC';
  const canReset = activeFilters > 0 || !isDefaultSort;

  function resetFilters() {
    setSearch('');
    setStatusFilter('ALL');
    setRoleFilter('ALL');
    setSortKey('EMAIL_ASC');
  }

  function clickHeader(next: SortKey) {
    setSortKey(next);
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
          {isActive
            ? sortKey.endsWith('_DESC')
              ? '↓'
              : '↑'
            : '↕'}
        </span>
      </button>
    );
  }

  const resetTarget = resetId ? list.find((u) => u.id === resetId) : null;

  return (
    <div className="space-y-4">
      {/* Add new */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-stone-700 mb-3">
          Add a new user
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label
              htmlFor="u-email"
              className="block text-xs font-medium text-stone-600 mb-1"
            >
              Email <span className="text-red-500">*</span>
            </label>
            <input
              id="u-email"
              type="email"
              placeholder="user@company.com"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              className="w-full px-2 py-1.5 border rounded text-sm"
              maxLength={255}
            />
          </div>
          <div>
            <label
              htmlFor="u-fullname"
              className="block text-xs font-medium text-stone-600 mb-1"
            >
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              id="u-fullname"
              placeholder="e.g. Sana Iqbal"
              value={draft.fullName}
              onChange={(e) =>
                setDraft({ ...draft, fullName: e.target.value })
              }
              className="w-full px-2 py-1.5 border rounded text-sm"
              maxLength={255}
            />
          </div>
          <div>
            <label
              htmlFor="u-role"
              className="block text-xs font-medium text-stone-600 mb-1"
            >
              Role
            </label>
            <select
              id="u-role"
              value={draft.role}
              onChange={(e) =>
                setDraft({ ...draft, role: e.target.value as UserView['role'] })
              }
              className="w-full px-2 py-1.5 border rounded text-sm"
            >
              <option value="inspector">Inspector</option>
              <option value="viewer">Viewer (read-only)</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="u-password"
              className="block text-xs font-medium text-stone-600 mb-1"
            >
              Password <span className="text-red-500">*</span>
            </label>
            <input
              id="u-password"
              type="password"
              placeholder="At least 8 characters"
              value={draft.password}
              onChange={(e) =>
                setDraft({ ...draft, password: e.target.value })
              }
              className="w-full px-2 py-1.5 border rounded text-sm font-mono"
              maxLength={255}
            />
          </div>
          <div>
            <label
              htmlFor="u-password2"
              className="block text-xs font-medium text-stone-600 mb-1"
            >
              Confirm password <span className="text-red-500">*</span>
            </label>
            <input
              id="u-password2"
              type="password"
              placeholder="Type the password again"
              value={draft.confirmPassword}
              onChange={(e) =>
                setDraft({ ...draft, confirmPassword: e.target.value })
              }
              className="w-full px-2 py-1.5 border rounded text-sm font-mono"
              maxLength={255}
            />
          </div>
          <div className="md:col-span-3 flex items-end gap-2 flex-wrap">
            <button
              onClick={create}
              disabled={
                !draft.email.trim() ||
                !draft.password ||
                !draft.fullName.trim() ||
                creating
              }
              className="bg-qc-600 hover:bg-qc-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {creating ? 'Saving…' : 'Add user'}
            </button>
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
              htmlFor="u-search"
              className="block text-xs text-stone-500 mb-1"
            >
              Search
            </label>
            <div className="relative">
              <input
                id="u-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Email, name…"
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
              htmlFor="u-status"
              className="block text-xs text-stone-500 mb-1"
            >
              Status
            </label>
            <select
              id="u-status"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as typeof statusFilter)
              }
              className="px-2 py-1.5 border rounded text-sm"
            >
              <option value="ALL">All</option>
              <option value="ACTIVE">Active only</option>
              <option value="INACTIVE">Inactive only</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="u-role-filter"
              className="block text-xs text-stone-500 mb-1"
            >
              Role
            </label>
            <select
              id="u-role-filter"
              value={roleFilter}
              onChange={(e) =>
                setRoleFilter(e.target.value as typeof roleFilter)
              }
              className="px-2 py-1.5 border rounded text-sm"
            >
              <option value="ALL">All roles</option>
              <option value="admin">Admin</option>
              <option value="inspector">Inspector</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="u-sort"
              className="block text-xs text-stone-500 mb-1"
            >
              Sort by
            </label>
            <select
              id="u-sort"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="px-2 py-1.5 border rounded text-sm"
            >
              <option value="EMAIL_ASC">Email A → Z</option>
              <option value="EMAIL_DESC">Email Z → A</option>
              <option value="NAME_ASC">Name A → Z</option>
              <option value="NAME_DESC">Name Z → A</option>
              <option value="ROLE_ASC">Role</option>
              <option value="STATUS_DESC">Status (active → inactive)</option>
              <option value="LAST_LOGIN_DESC">Last login (recent first)</option>
              <option value="LAST_LOGIN_ASC">Last login (oldest first)</option>
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
        <div className="px-4 py-3 bg-stone-50 border-b grid grid-cols-12 gap-4 text-sm">
          <div className="col-span-3">
            <SortHeader label="Email" sortValue="EMAIL_ASC" />
          </div>
          <div className="col-span-3">
            <SortHeader label="Name" sortValue="NAME_ASC" />
          </div>
          <div className="col-span-2">
            <SortHeader label="Role" sortValue="ROLE_ASC" />
          </div>
          <div className="col-span-2">
            <SortHeader label="Status / Activity" sortValue="STATUS_ASC" />
          </div>
          <div className="col-span-2 text-right text-stone-500 whitespace-nowrap">
            Actions
          </div>
        </div>

        <div className="divide-y divide-stone-100">
          {visible.length === 0 && (
            <div className="p-8 text-center text-stone-400 text-sm">
              {list.length === 0
                ? 'No users yet.'
                : 'No users match the current filter.'}
            </div>
          )}
          {visible.map((u) => {
            const isBootstrap = u.isSuperAdmin;
            const isSelf = u.id === caller.userId;
            // Edit + Deactivate stay locked for self + bootstrap:
            // you cannot change your own role/email, and the bootstrap
            // super-admin row is immutable from this screen (change its
            // password directly in the DB).
            const locked = isBootstrap || isSelf;
            // Reset-password is allowed for your own row (every other
            // admin tool allows self-service password resets from the
            // user list) but NOT for the bootstrap super-admin row.
            const canResetPwd = !isBootstrap;
            return editingId === u.id ? (
              <EditRow
                key={u.id}
                u={u}
                edit={edit}
                setEdit={setEdit}
                saving={editSaving}
                error={editError}
                onSave={() => saveEdit(u)}
                onCancel={cancelEdit}
              />
            ) : (
              <ReadRow
                key={u.id}
                u={u}
                isBootstrap={isBootstrap}
                isSelf={isSelf}
                locked={locked}
                canResetPwd={canResetPwd}
                onEdit={() => startEdit(u)}
                onToggle={() => toggleActive(u)}
                onResetPwd={() => openReset(u)}
              />
            );
          })}
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

      {/* Reset-password modal */}
      {resetTarget && (
        <ResetPwdModal
          u={resetTarget}
          password={resetPwd}
          password2={resetPwd2}
          setPassword={setResetPwd}
          setPassword2={setResetPwd2}
          saving={resetSaving}
          error={resetError}
          ok={resetOk}
          onCancel={cancelReset}
          onSubmit={() => submitReset(resetTarget)}
        />
      )}
    </div>
  );
}

function ActiveBadge({ u }: { u: UserView }) {
  return (
    <span
      className={`inline-block whitespace-nowrap text-xs px-2 py-0.5 rounded ${
        u.isActive
          ? 'bg-accept-soft text-accept-deep'
          : 'bg-stone-200 text-stone-600'
      }`}
    >
      {u.isActive ? 'ACTIVE' : 'INACTIVE'}
    </span>
  );
}

function RoleBadge({ u }: { u: UserView }) {
  const style =
    u.role === 'admin'
      ? 'bg-qc-100 text-qc-800'
      : u.role === 'inspector'
        ? 'bg-blue-100 text-blue-800'
        : 'bg-stone-100 text-stone-600';
  return (
    <span
      className={`inline-block whitespace-nowrap text-xs px-2 py-0.5 rounded ${style}`}
    >
      {ROLE_LABEL[u.role]}
    </span>
  );
}

function ReadRow({
  u,
  isBootstrap,
  isSelf,
  locked,
  canResetPwd,
  onEdit,
  onToggle,
  onResetPwd,
}: {
  u: UserView;
  isBootstrap: boolean;
  isSelf: boolean;
  locked: boolean;
  canResetPwd: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onResetPwd: () => void;
}) {
  return (
    <div className="px-4 py-3 grid grid-cols-12 gap-4 items-start text-sm">
      <div className="col-span-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="font-mono text-stone-800 break-all" title={u.email}>
            {u.email}
          </span>
        </div>
        <div className="text-xs text-stone-400 mt-0.5">
          Created {fmtDate(u.createdAt)}
        </div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {isBootstrap && (
            <span
              className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200"
              title="Bootstrap super-admin — cannot be edited or deactivated from this screen."
            >
              🔒 Super
            </span>
          )}
          {isSelf && !isBootstrap && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200">
              You
            </span>
          )}
          {u.mfaEnabled && (
            <span
              className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100"
              title="Multi-factor authentication enabled."
            >
              MFA
            </span>
          )}
        </div>
      </div>
      <div className="col-span-3 min-w-0 pt-0.5">
        <div className="text-stone-800 break-words">{u.fullName}</div>
      </div>
      <div className="col-span-2 pt-0.5">
        <RoleBadge u={u} />
      </div>
      <div className="col-span-2 pt-0.5">
        <ActiveBadge u={u} />
        <div className="text-[11px] text-stone-400 mt-1">
          Last login: {u.lastLoginAt ? fmtDate(u.lastLoginAt) : 'never'}
        </div>
      </div>
      <div className="col-span-2 flex justify-end gap-1.5 flex-wrap pt-0.5">
        <button
          type="button"
          onClick={onEdit}
          disabled={locked}
          className="text-xs px-2 py-1 rounded border border-stone-300 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title={
            isBootstrap
              ? 'The super-admin account cannot be edited.'
              : isSelf
                ? "You can't edit your own user record."
                : 'Edit this user'
          }
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onResetPwd}
          disabled={!canResetPwd}
          className="text-xs px-2 py-1 rounded border border-stone-300 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title={
            isBootstrap
              ? 'The super-admin account password cannot be reset from this screen.'
              : isSelf
                ? 'Reset your own password.'
                : 'Reset password'
          }
        >
          Reset pwd
        </button>
        <button
          type="button"
          onClick={onToggle}
          disabled={locked}
          className={`text-xs px-2 py-1 rounded border disabled:opacity-40 disabled:cursor-not-allowed ${
            u.isActive
              ? 'border-reject-border text-reject-deep hover:bg-reject-soft disabled:hover:bg-transparent'
              : 'border-green-300 text-green-800 hover:bg-green-50 disabled:hover:bg-transparent'
          }`}
          title={
            isBootstrap
              ? 'The super-admin account cannot be deactivated.'
              : isSelf
                ? "You can't deactivate your own account."
                : u.isActive
                  ? 'Deactivate'
                  : 'Reactivate'
          }
        >
          {u.isActive ? 'Deactivate' : 'Reactivate'}
        </button>
      </div>
    </div>
  );
}

function EditRow({
  u,
  edit,
  setEdit,
  saving,
  error,
  onSave,
  onCancel,
}: {
  u: UserView;
  edit: { fullName: string; email: string; role: UserView['role']; isActive: boolean };
  setEdit: (v: { fullName: string; email: string; role: UserView['role']; isActive: boolean }) => void;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="px-4 py-3 bg-qc-soft/40 border-l-4 border-qc-500">
      <div className="grid grid-cols-12 gap-4 items-center text-sm">
        <div className="col-span-3">
          <input
            value={edit.email}
            onChange={(e) => setEdit({ ...edit, email: e.target.value })}
            placeholder="Email"
            type="email"
            className="w-full px-2 py-1 border rounded text-sm font-mono"
            maxLength={255}
          />
        </div>
        <div className="col-span-3">
          <input
            value={edit.fullName}
            onChange={(e) => setEdit({ ...edit, fullName: e.target.value })}
            placeholder="Full name"
            className="w-full px-2 py-1 border rounded text-sm"
            maxLength={255}
          />
        </div>
        <div className="col-span-2">
          <select
            value={edit.role}
            onChange={(e) =>
              setEdit({ ...edit, role: e.target.value as UserView['role'] })
            }
            className="w-full px-1 py-1 border rounded text-xs"
          >
            <option value="admin">Admin</option>
            <option value="inspector">Inspector</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="flex items-center gap-1 text-xs text-stone-600">
            <input
              type="checkbox"
              checked={edit.isActive}
              onChange={(e) =>
                setEdit({ ...edit, isActive: e.target.checked })
              }
            />
            Active
          </label>
        </div>
        <div className="col-span-2 flex justify-end gap-1.5">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !edit.fullName.trim() || !edit.email.trim()}
            className="text-xs px-2 py-1 rounded bg-qc-600 text-white hover:bg-qc-700 disabled:opacity-40 disabled:cursor-not-allowed"
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
      {u.email !== edit.email && (
        <div className="mt-2 text-xs text-stone-500">
          Changing the email will change the user's login.
        </div>
      )}
    </div>
  );
}

function ResetPwdModal({
  u,
  password,
  password2,
  setPassword,
  setPassword2,
  saving,
  error,
  ok,
  onCancel,
  onSubmit,
}: {
  u: UserView;
  password: string;
  password2: string;
  setPassword: (v: string) => void;
  setPassword2: (v: string) => void;
  saving: boolean;
  error: string | null;
  ok: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl border border-stone-200 w-full max-w-md p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold">Reset password</h3>
            <p className="text-sm text-stone-500 mt-0.5">
              <span className="font-mono">{u.email}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-stone-400 hover:text-stone-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-xs text-stone-500 mb-3">
          The user will need to use the new password on their next login.
          Their existing sessions stay valid until the JWT expires (15 min).
        </p>
        <label className="block text-xs font-medium text-stone-600 mb-1">
          New password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          className="w-full px-2 py-1.5 border rounded text-sm font-mono mb-3"
          autoFocus
          maxLength={255}
        />
        <label className="block text-xs font-medium text-stone-600 mb-1">
          Confirm new password
        </label>
        <input
          type="password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          placeholder="Type the password again"
          className="w-full px-2 py-1.5 border rounded text-sm font-mono mb-3"
          maxLength={255}
        />
        {error && (
          <div className="text-xs text-reject-deep bg-reject-soft border border-reject-border rounded px-2 py-1 mb-3">
            {error}
          </div>
        )}
        {ok && (
          <div className="text-xs text-accept-deep bg-accept-soft border border-green-200 rounded px-2 py-1 mb-3">
            Password reset — the user can sign in with the new password now.
          </div>
        )}
        <div className="flex justify-end gap-2 mt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded border border-stone-300 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving || !password || !password2}
            className="bg-qc-600 hover:bg-qc-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Reset password'}
          </button>
        </div>
      </div>
    </div>
  );
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return '—';
  }
}
