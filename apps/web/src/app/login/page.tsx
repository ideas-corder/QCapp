'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiLogin, apiLoginMfa } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const sessionExpired = search?.get('expired') === '1';
  const [email, setEmail] = useState('admin@qc.local');
  const [password, setPassword] = useState('Admin@123');
  const [totpCode, setTotpCode] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!mfaToken) {
        // Lowercase + trim the email before sending. Backend now
        // normalises too, but doing it client-side means a typo like
        // "Admin@qc.local" still finds the admin row even if the
        // user types the wrong case — which is the conventional UX.
        const r = await apiLogin(email.trim().toLowerCase(), password);
        if (r.mode === 'mfa_required') {
          setMfaToken(r.mfaPendingToken);
          return;
        }
        await setTokens(r.accessToken, r.refreshToken);
        router.push(landingPath(r.user));
      } else {
        const r = await apiLoginMfa(mfaToken, totpCode);
        await setTokens(r.accessToken, r.refreshToken);
        router.push(landingPath(r.user));
      }
    } catch (e: any) {
      setError(e.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Where to send the user right after login. Inspectors go straight
   * to their own inspections list — the Executive / Vendor performance /
   * Analytics dashboards aggregate company-wide data and aren't
   * appropriate for a field inspector's view. Admins and viewers land
   * on the Executive dashboard as before.
   */
  function landingPath(user: {
    role?: string;
    isSuperAdmin?: boolean;
  }): string {
    if (user?.role === 'inspector' && !user?.isSuperAdmin) {
      return '/inspections';
    }
    return '/dashboard';
  }

  async function setTokens(access: string, refresh: string) {
    // Setting HttpOnly cookies via fetch is not possible; we hit the
    // Next.js route handlers below to set them server-side.
    await fetch('/api/auth/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access, refresh }),
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white p-8 rounded-2xl shadow border border-stone-200"
      >
        <div className="flex items-center gap-3 mb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-icon.png"
            alt=""
            width={48}
            height={48}
            className="shrink-0"
          />
          <div>
            <h1 className="text-2xl font-bold leading-tight">QC Inspector</h1>
            <p className="text-sm text-stone-500">Admin Portal</p>
          </div>
        </div>

        {sessionExpired && !error && (
          <div className="mb-4 p-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded">
            Your session expired. Please sign in again.
          </div>
        )}

        {error && (
          <div className="my-5 p-3 text-sm leading-5 text-reject-deep bg-reject-soft border border-reject-border rounded">
            {error}
          </div>
        )}

        {!mfaToken ? (
          <>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 mb-3 px-3 border rounded leading-10"
              required
            />
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 mb-5 px-3 border rounded leading-10"
              required
            />
          </>
        ) : (
          <>
            <p className="text-sm mb-2">
              Enter the 6-digit code from your authenticator app.
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              className="w-full mb-4 p-2 border rounded tracking-widest text-center text-lg"
              required
            />
          </>
        )}

        <button
          disabled={loading}
          className={`w-full bg-qc-strong hover:bg-qc-deep active:bg-qc-deep text-qc-on py-2.5 rounded font-semibold shadow-sm transition-colors disabled:cursor-wait disabled:opacity-100 ${loading ? 'animate-pulse' : ''}`}
        >
          {loading ? 'Signing in…' : mfaToken ? 'Verify code' : 'Sign in'}
        </button>

        <p className="mt-5 text-xs leading-5 text-stone-600 text-center">
          Demo: admin@qc.local / Admin@123 (MFA off until enrolled)
        </p>
      </form>
    </div>
  );
}
