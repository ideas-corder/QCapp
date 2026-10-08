import Sidebar from '@/components/Sidebar';
import LayoutSwitcher from '@/components/LayoutSwitcher';
import type { UserRole } from '@/lib/auth';
import { getUiLayoutFromCookie } from '@/lib/preferences';
import { requireCurrentUser } from '@/lib/server-session';

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  inspector: 'Inspector',
  viewer: 'Viewer',
};

const ROLE_BADGE_STYLE: Record<UserRole, string> = {
  admin: 'bg-qc-100 text-qc-800 border-qc-200',
  inspector: 'bg-blue-50 text-blue-800 border-blue-200',
  viewer: 'bg-stone-100 text-stone-700 border-stone-200',
};

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const caller = await requireCurrentUser();

  const uiLayout = getUiLayoutFromCookie();

  return (
    <div className="flex min-h-screen">
      <Sidebar caller={caller} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-stone-200 bg-white">
          <div className="flex items-center justify-end gap-3 px-6 py-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                ROLE_BADGE_STYLE[caller.role]
              }`}
              title={
                caller.isSuperAdmin
                  ? `Signed in as ${caller.email} (super-admin)`
                  : `Signed in as ${caller.email}`
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  caller.role === 'admin'
                    ? 'bg-qc-deep'
                    : caller.role === 'inspector'
                      ? 'bg-blue-500'
                      : 'bg-stone-400'
                }`}
              />
              {caller.isSuperAdmin ? 'Super-admin' : ROLE_LABEL[caller.role]}
              {caller.isSuperAdmin && caller.role === 'admin' && (
                <span className="ml-1 text-[10px] uppercase tracking-wider text-amber-700">
                  · owner
                </span>
              )}
            </span>
            <LayoutSwitcher current={uiLayout} />
          </div>
        </header>
        <main className="min-w-0 flex-1 bg-stone-100 px-6 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
