// Quick smoke test for new filter params
const BASE = 'http://127.0.0.1:3002';
const API = 'http://127.0.0.1:3001';

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@qc.local', password: 'Admin@123', totpCode: null }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  return res.json();
}

async function fetchAs(token, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: res.ok ? await res.json() : await res.text() };
}

(async () => {
  const { accessToken } = await login();
  const cats = await fetchAs(accessToken, `${BASE}/categories`);
  const sups = await fetchAs(accessToken, `${BASE}/suppliers`);
  const catId = cats.body[0]?.id;
  const supId = sups.body[0]?.id;
  console.log(`cat=${catId} sup=${supId}`);

  const tests = [
    { name: 'no filter', url: `${BASE}/inspections` },
    { name: 'search=PO', url: `${BASE}/inspections?search=PO` },
    { name: 'category', url: `${BASE}/inspections?categoryIds=${catId}` },
    { name: 'supplier', url: `${BASE}/inspections?supplierIds=${supId}` },
    { name: 'results=PASS', url: `${BASE}/inspections?results=PASS` },
    { name: 'syncStatuses=PENDING_SYNC', url: `${BASE}/inspections?syncStatuses=PENDING_SYNC` },
    { name: 'minCritical=1', url: `${BASE}/inspections?minCriticalCount=1` },
    { name: 'minMajor=1', url: `${BASE}/inspections?minMajorCount=1` },
    { name: 'lot 100..10000', url: `${BASE}/inspections?minLotSize=100&maxLotSize=10000` },
    { name: 'date MONTH', url: `${BASE}/inspections?dateRange=MONTH` },
    { name: 'sort LOT_DESC', url: `${BASE}/inspections?sortBy=LOT_DESC` },
    { name: 'combined', url: `${BASE}/inspections?categoryIds=${catId}&results=PASS&minMajorCount=0&dateRange=MONTH` },
  ];

  let failed = 0;
  for (const t of tests) {
    const r = await fetchAs(accessToken, t.url);
    const total = r.body?.total ?? '?';
    const ok = r.status === 200;
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${t.name.padEnd(28)} → ${r.status} total=${total}`);
  }

  // Also test the web server renders the filter bar component (it should not 500)
  const cookieJar = `qc_access=${accessToken}`;
  const webRes = await fetch(`${API}/inspections?categoryIds=${catId}&minCriticalCount=0`, {
    headers: { Cookie: cookieJar },
  });
  console.log(`\nWeb render with filters: ${webRes.status} (${webRes.status === 200 ? 'OK' : 'FAIL'})`);
  if (webRes.status !== 200) failed++;

  process.exit(failed > 0 ? 1 : 0);
})();
