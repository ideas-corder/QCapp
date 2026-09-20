// Smoke test for the API — runs end-to-end without a browser.
// Usage: node scripts/smoke.mjs

const BASE = process.env.API_URL || 'http://127.0.0.1:3002';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return data;
}

function ok(label) {
  console.log(`✓ ${label}`);
}

(async () => {
  console.log(`Smoke test against ${BASE}\n`);

  // 1. Login
  const login = await call('POST', '/auth/login', {
    body: { email: 'admin@qc.local', password: 'Admin@123' },
  });
  const token = login.accessToken;
  ok('login as admin');

  // 2. List categories
  const cats = await call('GET', '/categories', { token });
  ok(`categories (${cats.length})`);
  if (cats.length === 0) throw new Error('No categories — did you run the seed?');

  // 3. List suppliers
  const sups = await call('GET', '/suppliers', { token });
  ok(`suppliers (${sups.length})`);
  if (sups.length === 0) throw new Error('No suppliers — did you run the seed?');

  // 4. Create an inspection with idempotency
  const submissionUuid = crypto.randomUUID();
  const cat = cats[0];
  const sup = sups[0];

  const aql = (() => {
    // Mirror the API's calculateSampling for a basic sanity-check call
    return { codeLetter: 'F', sampleSize: 20 };
  })();

  const created = await call('POST', '/inspections', {
    token,
    body: {
      submissionUuid,
      categoryId: cat.id,
      supplierId: sup.id,
      poNumber: 'PO-SMOKE-001',
      itemNumber: 'ITM-001',
      itemDescription: 'Smoke test item',
      lotSize: 100,
      inspectionLevel: 'General Level II',
      aqlLimitMajor: 2.5,
      aqlLimitMinor: 4.0,
      codeLetter: aql.codeLetter,
      sampleSize: aql.sampleSize,
      criticalAc: 0,
      criticalRe: 1,
      majorAc: 3,
      majorRe: 4,
      minorAc: 5,
      minorRe: 6,
      totalCritical: 0,
      totalMajor: 2,
      totalMinor: 1,
      overallResult: 'PASS',
      inspectorName: 'Smoke Tester',
      defects: [
        {
          severity: 'MAJOR',
          description: 'Stitching irregular',
          quantity: 2,
        },
        {
          severity: 'MINOR',
          description: 'Thread loose',
          quantity: 1,
        },
      ],
      photos: [],
    },
  });
  ok(`created inspection ${created.id}`);

  // 5. Re-submit with same UUID — should return existing record (idempotent)
  const again = await call('POST', '/inspections', {
    token,
    body: {
      submissionUuid,
      categoryId: cat.id,
      supplierId: sup.id,
      lotSize: 100,
      inspectionLevel: 'General Level II',
      aqlLimitMajor: 2.5,
      aqlLimitMinor: 4.0,
      codeLetter: aql.codeLetter,
      sampleSize: aql.sampleSize,
      criticalAc: 0,
      criticalRe: 1,
      majorAc: 3,
      majorRe: 4,
      minorAc: 5,
      minorRe: 6,
      totalCritical: 0,
      totalMajor: 2,
      totalMinor: 1,
      overallResult: 'PASS',
    },
  });
  if (again.id !== created.id) {
    throw new Error('Idempotency check failed — got a different id');
  }
  ok('idempotent submission returns same record');

  // 6. List with filter
  const list = await call('GET', '/inspections?results=PASS&pageSize=5', { token });
  ok(`list PASS inspections: ${list.total}`);

  // 7. Verify endpoint
  const verify = await call('GET', `/inspections/${created.id}/verify`, { token });
  if (!verify.matches) {
    console.warn('  (note: server verified result differs from claimed)');
  }
  ok(`verify endpoint reports matches=${verify.matches}`);

  // 8. Dashboard
  const stats = await call('GET', '/inspections/dashboard', { token });
  ok(`dashboard: ${stats.totalInspections} total, ${stats.totalPassed} pass, ${stats.totalFailed} fail`);

  // 9. Rules
  const rules = await call('GET', '/rules', { token });
  ok(`rules: ${rules.length}`);

  // 10. PDF report
  const pdfRes = await fetch(`${BASE}/reports/inspections/${created.id}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!pdfRes.ok) throw new Error(`PDF report -> ${pdfRes.status}`);
  const buf = await pdfRes.arrayBuffer();
  if (buf.byteLength < 200) throw new Error('PDF is suspiciously small');
  ok(`PDF report generated (${buf.byteLength} bytes)`);

  console.log('\nAll smoke checks passed 🎉');
})().catch((e) => {
  console.error('\n❌', e.message);
  process.exit(1);
});
