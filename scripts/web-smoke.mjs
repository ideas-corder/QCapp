// Web admin smoke test — full login flow through the Next.js proxy.
const API = 'http://127.0.0.1:3002';
const WEB = 'http://127.0.0.1:3001';

async function jpost(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  return { status: r.status, body: t ? JSON.parse(t) : null };
}

(async () => {
  // 1. Get token from API directly
  const login = await jpost(`${API}/auth/login`, {
    email: 'admin@qc.local',
    password: 'Admin@123',
  });
  if (login.status !== 200) {
    console.log(`API login failed: ${login.status}`);
    process.exit(1);
  }
  console.log(`API login OK (mode=${login.body.mode})`);
  const token = login.body.accessToken;

  // 2. Set the cookie on the web app
  const setCookie = await jpost(`${WEB}/api/auth/set`, {
    access: token,
    refresh: token,
  });
  console.log(`Cookie set: ${setCookie.status}`);
  if (setCookie.status !== 200) {
    console.log(setCookie.body);
    process.exit(1);
  }
  const setCookieHeader = setCookie.body?.ok ? 'ok' : 'failed';

  // 3. Hit the dashboard with the cookie (via web's cookie jar proxy)
  // We do this by re-using fetch with the cookie manually because the
  // Node fetch API doesn't expose Set-Cookie reliably. The Next.js
  // /api/auth/set response sets cookies on its own origin; we now
  // need to send them back. Easiest path: replay the same header.
  const dashRes = await fetch(`${WEB}/dashboard`, {
    headers: { Cookie: `qc_access=${token}; qc_refresh=${token}` },
    redirect: 'manual',
  });
  console.log(`Dashboard fetch: ${dashRes.status}`);
  if (dashRes.status === 200) {
    const html = await dashRes.text();
    if (html.includes('Total inspections')) {
      console.log('Dashboard rendered with data ✓');
    } else {
      console.log('Dashboard 200 but missing data');
      console.log(html.substring(0, 500));
    }
  } else if (dashRes.status === 307) {
    console.log('Still redirected (cookie not flowing through fetch)');
  }

  // 4. Same for inspections list
  const inspRes = await fetch(`${WEB}/inspections`, {
    headers: { Cookie: `qc_access=${token}; qc_refresh=${token}` },
    redirect: 'manual',
  });
  console.log(`Inspections fetch: ${inspRes.status}`);
  if (inspRes.status === 200) {
    const html = await inspRes.text();
    if (html.includes('PASS') && html.includes('Inspections')) {
      console.log('Inspections list rendered with data ✓');
    }
  }

  // 5. Rules editor
  const rulesRes = await fetch(`${WEB}/rules`, {
    headers: { Cookie: `qc_access=${token}; qc_refresh=${token}` },
    redirect: 'manual',
  });
  console.log(`Rules fetch: ${rulesRes.status}`);
  if (rulesRes.status === 200) {
    const html = await rulesRes.text();
    if (html.includes('Quarantine')) {
      console.log('Rules editor rendered with seeded rules ✓');
    }
  }

  console.log('\nDone.');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
