import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set('qc_access', '', { path: '/', maxAge: 0 });
  res.cookies.set('qc_refresh', '', { path: '/', maxAge: 0 });
  return res;
}
