// Smoke test for bulk-import endpoints
const BASE = 'http://127.0.0.1:3002';

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@qc.local', password: 'Admin@123', totpCode: null }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  return res.json();
}

async function bulkImport(token, path, csv) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ csv }),
  });
  return { status: res.status, body: res.ok ? await res.json() : await res.text() };
}

async function getCount(token, path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.ok ? (await res.json()).length : -1;
}

(async () => {
  const { accessToken } = await login();
  const before = {
    categories: await getCount(accessToken, '/categories'),
    suppliers: await getCount(accessToken, '/suppliers'),
    rules: await getCount(accessToken, '/rules'),
    presets: await getCount(accessToken, '/filter-presets'),
  };
  console.log('Before:', before);

  // ---------- Categories ----------
  const catCsv = [
    'name,description,defaultAqlMajor,defaultAqlMinor,inspectionLevel,autoFailOnCritical,strictMode,maxAllowedDefects',
    'Bulk Imported Toys,Toys and games,1.0,2.5,General Level II,true,false,8',
    'Bulk Imported Electronics,Consumer electronics,0.65,1.5,General Level III,true,true,5',
    ',No name row,,2.5,4.0,General Level I,true,false,10',  // invalid: missing name
    'Bulk Imported Toys,Toys duplicate,1.0,2.5,General Level I,true,false,10',  // duplicate name
    'Bulk Imported Apparel,Clothing items,not-a-number,4.0,General Level II,true,false,10',  // bad number
  ].join('\n');

  const cat = await bulkImport(accessToken, '/categories/bulk-import', catCsv);
  console.log(`\n[Categories] ${cat.status}`, cat.body);

  // ---------- Suppliers ----------
  const supCsv = [
    'vendorId,name,requireDoubleInspection,autoDebitNoteLimit,notes',
    'VEN-200001,Bulk Import Co,true,500,Strategic partner',
    'VEN-200002,Bulk Import LLC,false,0,',
    'VEN-200003,Bulk Import Group,false,abc,bad limit',  // bad limit
    'VEN-200004,Bulk Import Co,true,500,duplicate name',  // duplicate name
    'VEN-200001,Bulk Import Dup,false,100,duplicate vendor',  // duplicate vendorId
    'VEN-bad,Bulk Import Bad,false,0,bad vendor id format',  // bad vendorId
  ].join('\n');

  const sup = await bulkImport(accessToken, '/suppliers/bulk-import', supCsv);
  console.log(`\n[Suppliers] ${sup.status}`, sup.body);

  // ---------- Rules ----------
  const ruleCsv = [
    'title,description,categoryTarget,conditionType,thresholdValue,action,isEnabled',
    'Bulk Rule: critical,Auto-quarantine critical,Bulk Imported Toys,CRITICAL_DEFECT_GT,2,QUARANTINE_LOT,true',
    'Bulk Rule: lot size,Flag big lots,ALL,LOT_SIZE_GT,5000,ESCALATE_DIRECTOR,true',
    'Bulk Rule: bad cond,BAD_CONDITION_X,1,QUARANTINE_LOT,false',  // bad condition + missing cols
  ].join('\n');

  const rule = await bulkImport(accessToken, '/rules/bulk-import', ruleCsv);
  console.log(`\n[Rules] ${rule.status}`, rule.body);

  // ---------- Presets ----------
  const presetCsv = [
    'name,description,criteria,isBuiltIn',
    '"Bulk Preset Failures","Failed last 7 days","{""selectedResults"":[""FAIL""],""dateRangeOption"":""WEEK""}",false',
    '"Bulk Preset Critical","Critical defects > 0","{""minCriticalCount"":1}",false',
    '"Bulk Preset BadJSON","Bad JSON criteria","{not valid json}",false',  // bad JSON
  ].join('\n');

  const preset = await bulkImport(accessToken, '/filter-presets/bulk-import', presetCsv);
  console.log(`\n[Presets] ${preset.status}`, preset.body);

  const after = {
    categories: await getCount(accessToken, '/categories'),
    suppliers: await getCount(accessToken, '/suppliers'),
    rules: await getCount(accessToken, '/rules'),
    presets: await getCount(accessToken, '/filter-presets'),
  };
  console.log('\nAfter:', after);
  console.log('Delta:', {
    categories: after.categories - before.categories,
    suppliers: after.suppliers - before.suppliers,
    rules: after.rules - before.rules,
    presets: after.presets - before.presets,
  });
})();
