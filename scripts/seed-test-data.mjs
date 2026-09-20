/**
 * Idempotent test-data seeder.
 * Adds a richer spread of suppliers, inspections, presets, and rules so
 * the filter bar, dashboard, and bulk-import features have something
 * interesting to chew on. Safe to re-run — checks for existing names.
 *
 *   node scripts/seed-test-data.mjs
 */
const API = 'http://127.0.0.1:3002';

async function login() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@qc.local', password: 'Admin@123', totpCode: null }),
  });
  if (!r.ok) throw new Error('login failed: ' + r.status);
  return (await r.json()).accessToken;
}

const H = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

async function list(token, path) {
  const r = await fetch(`${API}${path}`, { headers: H(token) });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

async function post(token, path, body) {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: H(token), body: JSON.stringify(body) });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: r.ok, status: r.status, body: json };
}

async function bulkImport(token, path, csv) {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: H(token), body: JSON.stringify({ csv }) });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: r.ok, status: r.status, body: json };
}

(async () => {
  const token = await login();

  // ----- Suppliers -----
  const sups = await list(token, '/suppliers');
  const haveSup = new Set(sups.map((s) => s.name));
  const supCsv = [
    'vendorId,name,requireDoubleInspection,autoDebitNoteLimit,notes',
    'VEN-100001,Northern Steel Works,false,150,Premium steel supplier',
    'VEN-100002,Delta Plastics,false,300,Recycled plastic components',
    'VEN-100003,Atlas Fasteners,true,750,Recent quality issues — under review',
    'VEN-100004,GlobeTech Electronics,false,200,Mixed PCBA supplier',
    'VEN-100005,Vintage Mills Apparel,false,100,Cotton textiles',
    'VEN-100006,RapidShip Logistics,false,0,Logistics partner',
  ]
    .filter((row, i) => i === 0 || !haveSup.has(row.split(',')[1]))
    .join('\n');

  if (supCsv.split('\n').length > 1) {
    const r = await bulkImport(token, '/suppliers/bulk-import', supCsv);
    console.log(`Suppliers bulk-import: ${r.status} created=${r.body.created ?? '?'} errors=${r.body.errors?.length ?? 0}`);
    if (r.body.errors?.length) console.log('  errors:', r.body.errors);
  } else {
    console.log('Suppliers: all 5 test suppliers already present, skipping.');
  }

  const supFinal = await list(token, '/suppliers');

  // ----- Rules -----
  const rules = await list(token, '/rules');
  const haveRules = new Set(rules.map((r) => r.title));
  const ruleCsv = [
    'title,description,categoryTarget,conditionType,thresholdValue,action,isEnabled',
    'Auto-debit for major defects,Issue debit note when majors exceed limit,Electronics,MAJOR_DEFECT_GT,5,ISSUE_DEBIT_NOTE,true',
    'Quarantine on critical (Apparel),Any critical defect quarantines apparel lots,Apparel,CRITICAL_DEFECT_GT,0,QUARANTINE_LOT,true',
    'Escalate large lots,Big lots go to director review,ALL,LOT_SIZE_GT,8000,ESCALATE_DIRECTOR,false',
    '"Total defects > 10 quarantine","If total defects exceed 10, quarantine the lot",ALL,TOTAL_DEFECT_GT,10,QUARANTINE_LOT,true',
  ]
    .filter((row, i) => {
      if (i === 0) return true;
      const title = row.split(',')[0].replace(/^"|"$/g, '');
      return !haveRules.has(title);
    })
    .join('\n');

  if (ruleCsv.split('\n').length > 1) {
    const r = await bulkImport(token, '/rules/bulk-import', ruleCsv);
    console.log(`Rules bulk-import: ${r.status} created=${r.body.created ?? '?'} errors=${r.body.errors?.length ?? 0}`);
    if (r.body.errors?.length) console.log('  errors:', r.body.errors);
  } else {
    console.log('Rules: all 4 test rules already present, skipping.');
  }

  // ----- Filter presets -----
  const presets = await list(token, '/filter-presets');
  const havePresets = new Set(presets.map((p) => p.name));
  const presetCsv = [
    'name,description,criteria,isBuiltIn',
    '"Critical Toys Only","Critical defects on toys only","{""selectedResults"":[""PASS"",""FAIL""],""minCriticalCount"":1}",false',
    '"This Week","Inspections from this week","{""dateRangeOption"":""WEEK""}",false',
    '"Large Lots","Lots above 5000","{""minLotSize"":5000}",false',
    '"Bulk Imported Electronics","Everything from bulk-imported electronics","{""searchQuery"":""bulk""}",false',
  ]
    .filter((row, i) => {
      if (i === 0) return true;
      const n = row.split(',')[0].replace(/^"|"$/g, '');
      return !havePresets.has(n);
    })
    .join('\n');

  if (presetCsv.split('\n').length > 1) {
    const r = await bulkImport(token, '/filter-presets/bulk-import', presetCsv);
    console.log(`Presets bulk-import: ${r.status} created=${r.body.created ?? '?'} errors=${r.body.errors?.length ?? 0}`);
    if (r.body.errors?.length) console.log('  errors:', r.body.errors);
  } else {
    console.log('Presets: all 4 test presets already present, skipping.');
  }

  // ----- Inspections -----
  // We POST directly to /inspections with a varying mix of categories,
  // suppliers, lot sizes, defects, dates, and results so the filter bar
  // has meaningful results across every dimension.
  const cats = await list(token, '/categories');
  const catByName = Object.fromEntries(cats.map((c) => [c.name, c.id]));
  const supByName = Object.fromEntries(supFinal.map((s) => [s.name, s.id]));

  // How many do we already have?
  const cur = await list(token, '/inspections?pageSize=1');
  const baseline = cur.total ?? 0;
  console.log(`\nInspections currently in DB: ${baseline}`);

  const inspectionFixtures = [
    // [daysAgo, category, supplier, lot, crit, maj, min, po, item, result]
    [0,  'Electronics', 'Pacific Textiles Ltd.',     1200, 0, 0, 2, 'PO-2026-1001', 'EL-1001', 'PASS'],
    [0,  'Apparel',     'Acme Manufacturing',        850,  0, 1, 3, 'PO-2026-1002', 'AP-2002', 'PASS'],
    [1,  'Electronics', 'Eastern Components Co.',    4200, 1, 2, 5, 'PO-2026-1003', 'EL-1003', 'FAIL'],
    [1,  'Apparel',     'Pacific Textiles Ltd.',     300,  0, 0, 1, 'PO-2026-1004', 'AP-2004', 'PASS'],
    [2,  'Electronics', 'Eastern Components Co.',    7800, 2, 4, 9, 'PO-2026-1005', 'EL-1005', 'FAIL'],
    [2,  'Apparel',     'Northern Steel Works',      500,  0, 0, 0, 'PO-2026-1006', 'AP-2006', 'PASS'],
    [3,  'Electronics', 'GlobeTech Electronics',     9500, 0, 0, 4, 'PO-2026-1007', 'EL-1007', 'PASS'],
    [4,  'Home Goods',  'Acme Manufacturing',        2200, 1, 1, 2, 'PO-2026-1008', 'HG-3008', 'PENDING_REVIEW'],
    [5,  'Apparel',     'Atlas Fasteners',           1500, 0, 3, 6, 'PO-2026-1009', 'AP-2009', 'FAIL'],
    [6,  'Electronics', 'Delta Plastics',            6400, 0, 0, 1, 'PO-2026-1010', 'EL-1010', 'PASS'],
    [8,  'Home Goods',  'Vintage Mills Apparel',     420,  0, 0, 0, 'PO-2026-1011', 'HG-3011', 'PASS'],
    [10, 'Electronics', 'Pacific Textiles Ltd.',     11000, 3, 5, 11, 'PO-2026-1012', 'EL-1012', 'FAIL'],
    [12, 'Apparel',     'Acme Manufacturing',        780,  0, 2, 4, 'PO-2026-1013', 'AP-2013', 'PASS'],
    [14, 'Electronics', 'Eastern Components Co.',    3400, 0, 1, 2, 'PO-2026-1014', 'EL-1014', 'PASS'],
    [18, 'Apparel',     'GlobeTech Electronics',     600,  0, 0, 0, 'PO-2026-1015', 'AP-2015', 'PASS'],
    [21, 'Electronics', 'Northern Steel Works',      15000, 4, 6, 14, 'PO-2026-1016', 'EL-1016', 'FAIL'],
    [25, 'Home Goods',  'Pacific Textiles Ltd.',     330,  0, 0, 1, 'PO-2026-1017', 'HG-3017', 'PASS'],
    [30, 'Electronics', 'Acme Manufacturing',        2800, 0, 1, 3, 'PO-2026-1018', 'EL-1018', 'PASS'],
    [35, 'Apparel',     'Delta Plastics',            950,  0, 0, 2, 'PO-2026-1019', 'AP-2019', 'PASS'],
    [45, 'Electronics', 'Atlas Fasteners',           5400, 1, 3, 7, 'PO-2026-1020', 'EL-1020', 'FAIL'],
  ];

  let created = 0;
  let skipped = 0;
  for (const [daysAgo, catName, supName, lot, crit, maj, min, po, item, result] of inspectionFixtures) {
    const catId = catByName[catName];
    const supId = supByName[supName];
    if (!catId || !supId) {
      console.log(`  skip: unknown ${!catId ? catName : supName}`);
      skipped++;
      continue;
    }
    // Compute AQL sample for the fixture so it looks realistic.
    // For a quick approximation: sample = round(lot / 10), Ac/Re proportional.
    const sample = Math.max(2, Math.round(lot / 10));
    const dto = {
      submissionUuid: crypto.randomUUID(),
      categoryId: catId,
      supplierId: supId,
      poNumber: po,
      itemNumber: item,
      itemDescription: `${catName} ${item}`,
      lotSize: lot,
      inspectionLevel: 'General Level II',
      aqlLimitMajor: 2.5,
      aqlLimitMinor: 4.0,
      codeLetter: lot < 501 ? 'F' : lot < 3201 ? 'H' : 'J',
      sampleSize: sample,
      criticalAc: 0,
      criticalRe: 1,
      majorAc: 1,
      majorRe: 2,
      minorAc: 2,
      minorRe: 3,
      totalCritical: crit,
      totalMajor: maj,
      totalMinor: min,
      overallResult: result,
      inspectorName: 'Test Inspector',
      inspectorNotes: `Seeded fixture for filter testing (${daysAgo}d ago).`,
      defects: [
        ...Array(crit).fill({ severity: 'CRITICAL', description: 'Safety defect', quantity: 1 }),
        ...Array(maj).fill({ severity: 'MAJOR', description: 'Visual defect', quantity: 1 }),
        ...Array(min).fill({ severity: 'MINOR', description: 'Cosmetic', quantity: 1 }),
      ],
    };
    const r = await post(token, '/inspections', dto);
    if (r.ok) {
      created++;
      // Backdate via raw SQL — TypeORM doesn't expose createdAt on POST, so
      // we use the DB directly. Skip if not Postgres-ish.
      try {
        const id = r.body.id;
        const { Client } = await import('pg').catch(() => ({ Client: null }));
        if (Client) {
          const c = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://qc:qc_password_change_me@127.0.0.1:5432/qc_inspector' });
          await c.connect();
          await c.query('UPDATE inspections SET created_at = NOW() - ($1::text || \' days\')::interval WHERE id = $2', [String(daysAgo), id]);
          await c.end();
        }
      } catch { /* pg not installed in node_modules; that's OK */ }
    } else {
      skipped++;
      console.log(`  POST inspection ${po} -> ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
    }
  }
  console.log(`\nInspections: created=${created} skipped=${skipped}`);

  const final = await list(token, '/inspections?pageSize=1');
  console.log(`Inspections now in DB: ${final.total}`);
})();
