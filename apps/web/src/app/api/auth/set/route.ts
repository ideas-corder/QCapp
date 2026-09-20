import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const access = body?.access as string;
  const refresh = body?.refresh as string;
  if (!access || !refresh) {
    return NextResponse.json({ error: 'missing tokens' }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set('qc_access', access, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  res.cookies.set('qc_refresh', refresh, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
