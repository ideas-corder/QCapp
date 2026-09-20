// End-to-end browser-equivalent test of the Submit Inspection flow.
// Mirrors exactly what the browser does:
//   1. Login → POST http://localhost:3002/auth/login (JSON in/out)
//   2. POST /api/auth/set → server-side route writes HttpOnly cookies
//   3. POST /api/backend/inspections → submit through the catch-all proxy
//   4. Verify the inspection is created with both carton photo kinds.
const ORIGIN = 'http://localhost:3001';
const API = 'http://localhost:3002';

function parseSetCookie(value) {
  const parts = value.split(/;\s*/);
  const [pair] = parts;
  const eq = pair.indexOf('=');
  if (eq < 0) return null;
  const name = pair.slice(0, eq).trim();
  let val = pair.slice(eq + 1).trim();
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  return { name, value: decodeURIComponent(val) };
}

const jar = new Map();

async function send(url, init = {}) {
  const headers = new Headers(init.headers || {});
  if (jar.size > 0) {
    const cookieStr = [...jar.entries()].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
    headers.set('cookie', cookieStr);
  }
  const res = await fetch(url, { ...init, headers, redirect: 'manual' });
  const setCookies =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);
  for (const sc of setCookies) {
    const parsed = parseSetCookie(sc);
    if (!parsed) continue;
    if (/Max-Age=0/i.test(sc) || /expires=Thu, 01 Jan 1970/i.test(sc)) {
      jar.delete(parsed.name);
    } else {
      jar.set(parsed.name, parsed.value);
    }
  }
  return res;
}

async function main() {
  console.log('[1] Login via API directly...');
  let r = await send(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@qc.local', password: 'Admin@123' }),
  });
  if (!r.ok) throw new Error(`login ${r.status}: ${await r.text()}`);
  const { accessToken, refreshToken } = await r.json();
  console.log('    tokens OK; access len:', accessToken.length);

  console.log('[2] POST /api/auth/set (browser sets HttpOnly cookies here)...');
  r = await send(`${ORIGIN}/api/auth/set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access: accessToken, refresh: refreshToken }),
  });
  if (!r.ok) throw new Error(`auth/set ${r.status}`);
  console.log('    cookies after:', [...jar.keys()].join(','));
  if (!jar.has('qc_access') || !jar.has('qc_refresh')) {
    throw new Error('qc_access / qc_refresh cookies NOT set!');
  }

  console.log('[3] Fetch option metadata via the proxy (sanity)...');
  const get = async (p) => {
    const rr = await send(`${ORIGIN}/api/backend${p}`, { headers: { 'Content-Type': 'application/json' } });
    if (!rr.ok) throw new Error(`GET ${p} ${rr.status}: ${await rr.text()}`);
    return rr.json();
  };
  const cats = await get('/categories');
  const pcats = await get('/product-categories?activeOnly=true');
  const insps = await get('/inspectors?activeOnly=true');
  const types = await get('/inspection-types?activeOnly=true');
  const aql = await get('/aql-master?activeOnly=true');

  const catId = cats.find((c) => c.isActive).id;
  const pcatId = pcats[0].id;
  const inspId = insps[0].id;
  const itType = types.find((t) => t.isActive).code;
  const aqlRow = aql[0];

  console.log(`    using cat=${catId.slice(0,8)} pcat=${pcatId.slice(0,8)} insp=${inspId.slice(0,8)} type=${itType} aql=${aqlRow.minQty}-${aqlRow.maxQty}`);

  console.log('[4] POST /api/backend/inspections — this is exactly what the form does on Submit...');
  const payload = {
    submissionUuid: crypto.randomUUID(),
    categoryId: catId,
    productCategoryId: pcatId,
    supplierId: '2415f4e7-5ef3-4263-9668-02079ff6c334',
    inspectionType: itType,
    aqlMasterId: aqlRow.id,
    codeLetter: '',
    sampleSize: aqlRow.sampleSize,
    criticalAc: 0, criticalRe: 1, majorAc: 0, majorRe: 1, minorAc: 0, minorRe: 1,
    totalCritical: 0, totalMajor: 0, totalMinor: 0,
    overallResult: 'PASS',
    inspectorMasterId: inspId,
    orderQuantity: 500, presentedQuantity: 500, inspectedQuantity: 50,
    totalCartons: 100, inspectedCartons: 50,
    fabricQuality: 'OK',
    photos: [
      { url: '/uploads/photo/test.png', mimeType: 'image/png', size: 100, kind: 'CARTON_UPLOAD' },
      { url: '/uploads/photo/test.png', mimeType: 'image/png', size: 100, kind: 'CARTON_INSPECT' },
    ],
  };
  r = await send(`${ORIGIN}/api/backend/inspections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await r.text();
  console.log(`    status: ${r.status}`);
  if (r.status !== 201) {
    console.log('    body:', body.slice(0, 500));
    throw new Error(`Submit failed: ${r.status}`);
  }
  const created = JSON.parse(body);
  console.log('    CREATED id:', created.id);
  console.log('    totalCartons:', created.totalCartons, 'inspectedCartons:', created.inspectedCartons);
  console.log('    photos:', created.photos.map((p) => p.kind).join(','));
  if (created.totalCartons !== 100 || created.inspectedCartons !== 50) {
    throw new Error('Carton counts did not round-trip!');
  }
  if (created.photos.length !== 2) throw new Error('Photo count mismatch!');
  console.log('[OK] Submit flow verified end-to-end.');
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
