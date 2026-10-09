'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { CallerIdentity, UserRole } from '@/lib/auth';

/**
 * Sidebar groups links into sections (Overview / Records / System) so
 * the user can scan destinations the way the reference "Procurement
 * Portal" sidebar does. Section headings render as small uppercase
 * muted labels; the active page is highlighted with a brand
 * background + left accent bar; inactive items use the muted sidebar
 * text on hover.
 *
 * Role gating — matches the API's @Roles guards AND the row-scoping
 * in the inspections service so the UI never offers destinations an
 * inspector should not see:
 *   - admin / super-admin : full Overview (Executive, Vendor
 *                            performance, Analytics workbench),
 *                            Records, and System > Users + Settings.
 *   - viewer              : Overview + Settings (read-only).
 *   - inspector           : ONLY their own inspections. The Executive
 *                            / Vendor performance / Analytics workbench
 *                            pages aggregate ALL company data and the
 *                            Settings page is cosmetic; neither is
 *                            appropriate for an inspector whose view of
 *                            the platform is strictly their own work.
 *
 * Middleware obtains the caller identity from the API's `/auth/me` endpoint
 * and the protected layout passes it here as a prop. The same role policy is
 * enforced by middleware for deep links and by API guards for data access.
 */
type NavLink = { href: string; label: string; icon?: React.ReactNode };
type NavGroup = { label: string; links: NavLink[] };

function buildGroups(role: UserRole, isSuperAdmin: boolean): NavGroup[] {
  // Inspectors see only their own inspections list. No Overview
  // dashboards (those aggregate company-wide data they must not see),
  // no Records (admin-only master data), no Settings (cosmetic and
  // not relevant to field inspectors).
  if (role === 'inspector' && !isSuperAdmin) {
    return [
      {
        label: 'My Work',
        links: [{ href: '/inspections', label: 'Inspections' }],
      },
    ];
  }

  // Overview — everyone except inspectors sees these.
  const overview: NavGroup = {
    label: 'Overview',
    links: [
      { href: '/dashboard', label: 'Executive' },
      { href: '/dashboard/performance', label: 'Vendor performance' },
      { href: '/dashboard/analytics', label: 'Analytics workbench' },
      { href: '/inspections', label: 'Inspections' },
    ],
  };

  // Records — admin-only. Inspectors and viewers don't manage
  // reference data (and the API 403s them anyway on every GET).
  const groups: NavGroup[] = [overview];
  if (role === 'admin' || isSuperAdmin) {
    groups.push({
      label: 'Records',
      links: [
        { href: '/product-categories', label: 'Product Categories' },
        { href: '/inspection-types', label: 'Inspection Types' },
        { href: '/aql-master', label: 'AQL Master' },
        { href: '/inspectors', label: 'Inspectors' },
        { href: '/suppliers', label: 'Suppliers' },
      ],
    });
  }

  // System — Users is super-admin-only; Settings is open to admins
  // and viewers (not to inspectors, handled by the early return above).
  const systemLinks: NavLink[] = [];
  if (isSuperAdmin) {
    systemLinks.push({ href: '/users', label: 'Users' });
  }
  systemLinks.push({ href: '/settings', label: 'Settings' });
  groups.push({ label: 'System', links: systemLinks });

  return groups;
}

export default function Sidebar({ caller }: { caller: CallerIdentity | null }) {
  const pathname = usePathname();
  const router = useRouter();

  // If we have no caller (cookie expired between page renders), the
  // layout would already be redirecting; still, render an empty
  // sidebar rather than crashing.
  const groups = caller ? buildGroups(caller.role, caller.isSuperAdmin) : [];

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="sticky top-0 self-start h-screen w-64 shrink-0 bg-sidebar text-sidebar-text flex flex-col">
      <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-icon.png"
          alt=""
          width={36}
          height={36}
          className="shrink-0 rounded"
        />
        <div className="min-w-0">
          <h1 className="font-bold text-base leading-tight tracking-tight">
            QC Inspector
          </h1>
          <p className="text-[11px] text-sidebar-muted mt-0.5 uppercase tracking-wider">
            {caller?.isSuperAdmin
              ? 'Super-admin Portal'
              : caller
                ? `${caller.role.charAt(0).toUpperCase()}${caller.role.slice(1)} Portal`
                : 'Admin Portal'}
          </p>
        </div>
      </div>
      <nav className="sidebar-scrollbar flex-1 overflow-y-auto px-3 py-3">
        {groups.map((g) => (
          <div key={g.label} className="mb-4">
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-sidebar-muted">
              {g.label}
            </div>
            <div className="space-y-0.5">
              {g.links.map((l) => {
                const active =
                  pathname === l.href ||
                  (l.href !== '/dashboard' && pathname?.startsWith(l.href));
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`relative block pl-4 pr-3 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
                      active
                        ? 'bg-qc text-qc-on'
                        : 'text-sidebar-text hover:bg-sidebar-border'
                    }`}
                  >
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-white rounded-r"
                      />
                    )}
                    {l.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={logout}
          className="w-full text-[13px] py-2 px-3 rounded-md text-sidebar-text hover:bg-sidebar-border transition-colors text-left font-medium"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
