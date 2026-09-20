import './globals.css';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Sidebar from '@/components/Sidebar';
import ThemeProvider from '@/components/ThemeProvider';
import LayoutSwitcher from '@/components/LayoutSwitcher';
import { getUiLayoutFromCookie } from '@/lib/preferences';
import { ACCESS_COOKIE, getCallerFromCookie, type UserRole } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'QC Inspector Admin',
  description: 'Enterprise Quality Assurance & Inspection Platform',
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png', sizes: '32x32' },
      { url: '/logo-icon.png', type: 'image/png', sizes: 'any' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
};

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get(ACCESS_COOKIE)?.value;
  const uiLayout = getUiLayoutFromCookie();
  const caller = getCallerFromCookie();
  return (
    <html lang="en">
      <body className="bg-stone-100 text-stone-900 antialiased">
        <ThemeProvider />
        {token ? (
          <div className="flex min-h-screen">
            <Sidebar caller={caller} />
            <div className="flex-1 flex flex-col min-w-0">
              <header className="sticky top-0 z-40 bg-white border-b border-stone-200">
                <div className="flex items-center justify-end gap-3 px-6 py-3">
                  {caller && (
                    <span
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${
                        ROLE_BADGE_STYLE[caller.role]
                      }`}
                      title={
                        caller.isSuperAdmin
                          ? `Signed in as ${caller.email} (super-admin)`
                          : `Signed in as ${caller.email}`
                      }
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
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
                  )}
                  <LayoutSwitcher current={uiLayout} />
                </div>
              </header>
              <main className="flex-1 px-6 py-6 bg-stone-100 min-w-0">{children}</main>
            </div>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
