import Link from 'next/link';

export const metadata = { title: 'Inspections — data entry wireframes' };

export default function WireframesPage() {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-10">
      <header>
        <h1 className="text-3xl font-bold">Inspections — data entry options</h1>
        <p className="text-stone-600 mt-2 max-w-3xl">
          Three ways to add inspection data into the system. Each is wired against
          the existing <code className="bg-stone-100 px-1 rounded">POST /inspections</code>{' '}
          endpoint. Pick the one that matches how you actually need to enter data.
        </p>
      </header>

      {/* ============= OPTION A — Single inspection form on web ============= */}
      <section className="space-y-3">
        <div className="flex items-baseline gap-3">
          <span className="bg-qc-600 text-white text-xs font-bold px-2 py-0.5 rounded">A</span>
          <h2 className="text-xl font-semibold">Single inspection form on the web</h2>
        </div>
        <p className="text-sm text-stone-600">
          One inspection at a time from the office. Best for backfilling records,
          admin corrections, or when no phone is available. <strong>No photo / signature /
          barcode</strong> — those still need the mobile app.
        </p>

        {/* Wireframe */}
        <div className="bg-stone-50 border-2 border-dashed border-stone-300 rounded-xl p-6">
          <div className="bg-white rounded-lg shadow-sm border max-w-4xl">
            {/* breadcrumb */}
            <div className="px-6 pt-5 text-xs text-stone-500">
              Inspections › <span className="text-stone-700">New inspection</span>
            </div>
            <div className="px-6 pt-2 pb-4">
              <h3 className="text-2xl font-bold">New inspection</h3>
              <p className="text-xs text-stone-500 mt-1">
                Fill in the basics. AQL sample size and PASS/FAIL are computed automatically.
              </p>
            </div>

            <div className="px-6 grid grid-cols-2 gap-4">
              <Field label="PO number" placeholder="PO-2026-0451" required />
              <Field label="Item number" placeholder="ITM-A-213" required />
              <Select label="Category" value="Electronics" required />
              <Select label="Supplier" value="Acme Manufacturing" required />
              <Field label="Lot size" type="number" placeholder="5000" required />
              <Field label="Inspector" placeholder="inspector@qc.local" hint="Defaults to your login" />

              <div className="col-span-2">
                <label className="block text-xs font-medium text-stone-600 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  rows={2}
                  className="w-full px-2 py-1.5 border rounded text-sm bg-stone-50"
                  placeholder="Anything unusual about this lot?"
                  disabled
                />
              </div>
            </div>

            <div className="px-6 mt-5">
              <h4 className="font-semibold text-sm mb-2">Defects captured</h4>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Critical" type="number" placeholder="0" />
                <Field label="Major" type="number" placeholder="0" />
                <Field label="Minor" type="number" placeholder="0" />
              </div>
            </div>

            {/* live AQL preview box */}
            <div className="mx-6 mt-4 p-3 rounded border bg-blue-50 border-blue-200">
              <div className="text-xs font-medium text-blue-800 mb-1">AQL plan (reference)</div>
              <div className="grid grid-cols-3 gap-3 text-xs text-blue-900">
                <div>Sample size: <strong>200</strong></div>
                <div>Accept major: <strong>10</strong></div>
                <div>Accept critical: <strong>0</strong></div>
              </div>
              <div className="mt-2 text-xs text-blue-800">
                Thresholds shown for reference. The inspector's verdict
                (Pass / Fail / Rework) is the final outcome.
              </div>
            </div>

            <div className="px-6 py-4 mt-3 flex items-center justify-between border-t">
              <Link href="/inspections" className="text-sm text-stone-600 hover:underline">
                ← Back to list
              </Link>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 text-sm border rounded">Save as draft</button>
                <button className="bg-qc-600 text-white px-4 py-1.5 rounded text-sm">
                  Submit inspection
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded p-4 text-sm">
          <div className="font-medium mb-1">Pros</div>
          <ul className="list-disc pl-5 text-stone-700 space-y-0.5">
            <li>Same login, same UI, no need for the phone</li>
            <li>AQL math + result computed client-side as you type</li>
            <li>Useful for office corrections and demo data</li>
          </ul>
          <div className="font-medium mt-3 mb-1">Cons</div>
          <ul className="list-disc pl-5 text-stone-700 space-y-0.5">
            <li>No photo / signature / barcode — those are mobile-only</li>
            <li>Slow if you need to enter dozens of inspections</li>
          </ul>
        </div>
      </section>

      {/* ============= OPTION B — Mobile-first (existing flow) ============= */}
      <section className="space-y-3">
        <div className="flex items-baseline gap-3">
          <span className="bg-qc-600 text-white text-xs font-bold px-2 py-0.5 rounded">B</span>
          <h2 className="text-xl font-semibold">Mobile app (field inspector flow)</h2>
        </div>
        <p className="text-sm text-stone-600">
          The original workflow. Inspectors log in on their phone, scan a PO or item
          number, capture defects with photos, sign off, and the record syncs up.
          The web admin then sees it on the inspections list.
        </p>

        <div className="bg-stone-50 border-2 border-dashed border-stone-300 rounded-xl p-6">
          <div className="flex flex-wrap gap-4 justify-center">
            {[
              { title: '1. New inspection', body: 'Pick category + supplier; auto-loads AQL rules' },
              { title: '2. Scan / enter PO', body: 'Barcode scanner or manual entry' },
              { title: '3. AQL sample size', body: 'App shows how many units to inspect' },
              { title: '4. Capture defects', body: 'Tap critical/major/minor, attach photos' },
              { title: '5. Sign + submit', body: 'Signature pad; offline queue if no signal' },
              { title: '6. Sync', body: 'Pushes to API; shows on web list' },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm border w-44 p-3">
                <div className="text-xs font-mono text-qc-700">Step {i + 1}</div>
                <div className="font-semibold text-sm mt-1">{s.title}</div>
                <div className="text-xs text-stone-500 mt-1">{s.body}</div>
                <div className="mt-2 h-20 bg-stone-100 rounded border flex items-center justify-center text-stone-400 text-xs">
                  [ phone screen ]
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border rounded p-4 text-sm">
          <div className="font-medium mb-1">Pros</div>
          <ul className="list-disc pl-5 text-stone-700 space-y-0.5">
            <li>Full feature set: photos, signatures, offline, barcode</li>
            <li>The platform was designed for this</li>
          </ul>
          <div className="font-medium mt-3 mb-1">Cons</div>
          <ul className="list-disc pl-5 text-stone-700 space-y-0.5">
            <li>Requires the Flutter app running on a device</li>
            <li>Slower than bulk import for big backfills</li>
          </ul>
        </div>
      </section>

      {/* ============= OPTION C — Bulk CSV import ============= */}
      <section className="space-y-3">
        <div className="flex items-baseline gap-3">
          <span className="bg-qc-600 text-white text-xs font-bold px-2 py-0.5 rounded">C</span>
          <h2 className="text-xl font-semibold">Bulk CSV import</h2>
        </div>
        <p className="text-sm text-stone-600">
          Upload a CSV with one row per inspection. Same pattern as the other
          editors (Categories / Suppliers). Fastest path for seeding historical
          data or doing a big migration.
        </p>

        <div className="bg-stone-50 border-2 border-dashed border-stone-300 rounded-xl p-6">
          <div className="bg-white rounded-lg shadow-sm border max-w-4xl">
            <div className="px-6 pt-5 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold">Import inspections from CSV</h3>
                <p className="text-xs text-stone-500 mt-1">
                  One row per inspection. Defects and sample size are optional —
                  AQL math runs server-side.
                </p>
              </div>
              <button className="text-sm px-3 py-1.5 border rounded">
                ⬇ Download template
              </button>
            </div>

            {/* Drop zone */}
            <div className="mx-6 mt-4 p-8 border-2 border-dashed border-stone-300 rounded text-center bg-stone-50">
              <div className="text-3xl text-stone-400">⬆</div>
              <div className="text-sm mt-1">
                Drop your <code className="bg-stone-200 px-1 rounded">.csv</code> here, or{' '}
                <span className="text-qc-700 underline cursor-pointer">browse</span>
              </div>
              <div className="text-xs text-stone-500 mt-1">Max 5,000 rows · 10 MB</div>
            </div>

            {/* Preview */}
            <div className="mx-6 mt-4">
              <div className="text-xs font-medium text-stone-700 mb-1">
                Preview (first 5 of 142 rows)
              </div>
              <div className="border rounded overflow-hidden text-xs">
                <table className="w-full">
                  <thead className="bg-stone-100 text-left">
                    <tr>
                      <th className="p-2">PO</th>
                      <th>Item</th>
                      <th>Lot</th>
                      <th>Cat</th>
                      <th>Sup</th>
                      <th>Crit</th>
                      <th>Maj</th>
                      <th>Min</th>
                      <th>Result</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['PO-1', 'ITM-A', 500, 'Apparel', 'Acme', 0, 1, 2, 'PASS', '✓'],
                      ['PO-2', 'ITM-B', 1200, 'Electronics', 'Shenzhen', 0, 0, 0, 'PASS', '✓'],
                      ['PO-3', 'ITM-C', 750, 'Apparel', 'Mumbai', 2, 1, 0, 'FAIL', '✓'],
                      ['PO-4', 'ITM-D', 800, 'Apparel', 'Delta', 0, 0, 1, 'PASS', '✓'],
                      ['PO-5', 'ITM-E', 1500, 'Electronics', 'Atlas', 1, 0, 0, 'FAIL', '✓'],
                    ].map((row, i) => (
                      <tr key={i} className="border-t">
                        {row.map((c, j) => (
                          <td key={j} className="p-2">{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Result block */}
            <div className="mx-6 mt-4 p-3 border border-green-200 bg-green-50 rounded text-sm">
              <div className="font-medium text-green-800">
                ✓ 141 rows imported · 1 row skipped
              </div>
              <div className="text-xs text-green-700 mt-1">
                Row 87: missing <code>categoryName</code> — skipped (validation failed)
              </div>
            </div>

            <div className="px-6 py-4 mt-3 flex items-center justify-between border-t">
              <span className="text-xs text-stone-500">Uploads are transactional — partial failures don't half-save.</span>
              <button className="bg-qc-600 text-white px-4 py-1.5 rounded text-sm">
                Import 141 inspections
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded p-4 text-sm">
          <div className="font-medium mb-1">Pros</div>
          <ul className="list-disc pl-5 text-stone-700 space-y-0.5">
            <li>Fastest for big backfills (100s–1000s at once)</li>
            <li>Matches the pattern of your other editors — muscle memory</li>
            <li>Template download + per-row error report</li>
            <li>Transactional: either all valid rows save or you see exactly which failed</li>
          </ul>
          <div className="font-medium mt-3 mb-1">Cons</div>
          <ul className="list-disc pl-5 text-stone-700 space-y-0.5">
            <li>Photos / signatures stay empty (CSV can't carry those)</li>
            <li>Still need to type the CSV somewhere (Excel, Sheets)</li>
          </ul>
        </div>
      </section>

      {/* Recommendation */}
      <section className="bg-qc-50 border border-qc-200 rounded-xl p-5">
        <h3 className="font-semibold text-qc-900">My recommendation</h3>
        <p className="text-sm text-qc-900 mt-1">
          If you're seeding test data or backfilling dozens of inspections → <strong>C (CSV)</strong>.
          If you want to enter one or two from your desk → <strong>A (web form)</strong>.
          For real field work, <strong>B (mobile)</strong> is the right path and the data
          will appear on the web list automatically once submitted.
        </p>
        <p className="text-sm text-qc-900 mt-2">
          Want me to build any of these? Pick one (or more) and I'll wire it end-to-end.
        </p>
      </section>
    </div>
  );
}

function Field({
  label,
  placeholder,
  type = 'text',
  required,
  hint,
}: {
  label: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-stone-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        disabled
        className="w-full px-2 py-1.5 border rounded text-sm bg-stone-50 text-stone-700"
      />
      {hint && <div className="text-[10px] text-stone-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function Select({
  label,
  value,
  required,
}: {
  label: string;
  value: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-stone-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="w-full px-2 py-1.5 border rounded text-sm bg-stone-50 text-stone-700 flex items-center justify-between">
        <span>{value}</span>
        <span className="text-stone-400">▾</span>
      </div>
    </div>
  );
}
