import { apiFetchOptional } from '@/lib/api';
import UsersEditor from './UsersEditor';

interface UserView {
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

/**
 * Server-side load: fetch the full user list via the
 * super-admin-only `GET /users/all` endpoint. If the caller
 * isn't a super-admin we still load the page but pass `null` so
 * the editor renders the "you don't have permission" state instead
 * of crashing on a 403.
 */
async function fetchUsers(): Promise<{
  items: UserView[] | null;
  forbidden: boolean;
  caller: { userId: string; isSuperAdmin: boolean; email: string; role: string } | null;
}> {
  // Identify the caller via /auth/me so we can render the "you
  // can't edit yourself" affordance without an extra round trip.
  // /auth/me returns the AuthUser shape with `userId` (the JWT
  // subject) — see apps/api/src/auth/auth.controller.ts `me()`.
  const me = await apiFetchOptional<{
    userId: string;
    email: string;
    role: string;
    isSuperAdmin: boolean;
  }>('/auth/me', {}, '/users');
  if (!me) return { items: null, forbidden: false, caller: null };

  // /users/all is super-admin-only; super-admins see the full
  // list, everyone else gets `null` so the page renders an
  // explanation rather than a 403 crash.
  if (!me.isSuperAdmin) {
    return { items: null, forbidden: true, caller: me };
  }

  const users = await apiFetchOptional<UserView[]>('/users/all', {}, '/users');
  return { items: users, forbidden: false, caller: me };
}

export default async function UsersPage() {
  const { items, forbidden, caller } = await fetchUsers();

  if (forbidden || !items) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Users</h1>
        <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded">
          <div className="font-semibold mb-1">Super-admin privileges required</div>
          <p className="text-sm">
            Only super-admin accounts can manage the Users master. Ask
            the bootstrap owner (<code>admin@qc.local</code>) for an
            upgrade, or sign in as that account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Users</h1>
      <p className="text-sm text-stone-500 mb-4">
        Login accounts for the QC Inspector admin portal. The seeded
        <span className="font-mono mx-1">admin@qc.local</span>
        account is the bootstrap super-admin and cannot be edited or
        deactivated from this screen. Soft-deleting a user flips
        <code className="mx-1">isActive</code> to false so past inspections
        still resolve to a valid user.
      </p>
      <UsersEditor initial={items} caller={caller!} />
    </div>
  );
}
