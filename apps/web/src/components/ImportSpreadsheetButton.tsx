'use client';
import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { clientApiFetch } from '@/lib/api-client';

export type ImportResult = {
  created: number;
  errors: { row: number; message: string }[];
};

type Props = {
  /** API endpoint (relative to /api/backend) e.g. "/inspection-types/bulk-import" */
  endpoint: string;
  /** Sample CSV shown when user clicks "Download template" */
  templateCsv: string;
  /** Filename for the downloaded template (CSV) */
  templateName: string;
  /** Human label, e.g. "Import inspection types" */
  label?: string;
  /** Called after a successful import so the parent can refresh its list */
  onImported?: (result: ImportResult) => void;
};

/**
 * Drop-in import button that handles both CSV and Excel (.xlsx) uploads.
 *
 *  - CSV is read as text, sent as-is to the server.
 *  - Excel is parsed with SheetJS in the browser, converted to CSV, then
 *    sent to the same server endpoint. That way the backend only has one
 *    well-tested path.
 *
 * The template download is always a CSV — small, friendly, and Excel can
 * open it natively when the user wants a starting point.
 */
export default function ImportSpreadsheetButton({
  endpoint,
  templateCsv,
  templateName,
  label = 'Import CSV / Excel',
  onImported,
}: Props) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileKind, setFileKind] = useState<'csv' | 'xlsx' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function downloadTemplate() {
    const blob = new Blob([templateCsv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = templateName;
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    setCsv('');
    setFileName('');
    setFileKind('');
    setResult(null);
    setSubmitError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function readFile(file: File) {
    const lower = file.name.toLowerCase();
    setFileName(file.name);

    if (lower.endsWith('.csv') || file.type === 'text/csv') {
      setFileKind('csv');
      const text = await file.text();
      setCsv(text);
      return;
    }

    if (
      lower.endsWith('.xlsx') ||
      lower.endsWith('.xls') ||
      file.type.includes('spreadsheet') ||
      file.type.includes('excel')
    ) {
      setFileKind('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) {
        setSubmitError('Workbook has no sheets.');
        return;
      }
      const ws = wb.Sheets[sheetName];
      // Generate CSV with comma delimiter, force quotes for safety.
      const text = XLSX.utils.sheet_to_csv(ws, { FS: ',' });
      setCsv(text);
      return;
    }

    setSubmitError(
      `Unsupported file type "${file.type || file.name}". Please upload .csv or .xlsx.`,
    );
    setFileKind('');
    setCsv('');
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  async function submit() {
    if (!csv.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await clientApiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      if (!res.ok) {
        const text = await res.text();
        setSubmitError(`Server error ${res.status}: ${text.slice(0, 200)}`);
        return;
      }
      const json = (await res.json()) as ImportResult;
      setResult(json);
      if (json.created > 0 && onImported) onImported(json);
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const previewLines = csv ? csv.split(/\r?\n/).slice(0, 6) : [];
  const previewKind =
    fileKind === 'xlsx' ? ' (parsed from Excel)' : '';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-white border border-qc-strong text-qc-deep hover:bg-qc-soft px-3 py-1.5 rounded text-sm font-medium"
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl border border-stone-200 shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200">
              <h3 className="font-semibold">{label}</h3>
              <button
                type="button"
                onClick={close}
                className="text-stone-500 hover:text-stone-800"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {!result ? (
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 bg-stone-50 border border-stone-200 rounded p-3">
                  <div className="text-sm text-stone-700">
                    Need the column shape? Download a sample CSV first.
                  </div>
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="text-xs px-3 py-1.5 rounded border border-stone-300 hover:bg-white"
                  >
                    ⬇ Download template
                  </button>
                </div>

                <div
                  onDrop={onDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-stone-300 rounded-lg p-6 text-center hover:border-qc-500"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls"
                    onChange={onPick}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-qc-600 hover:bg-qc-700 text-white px-4 py-2 rounded text-sm"
                  >
                    Choose CSV or Excel file
                  </button>
                  <div className="text-xs text-stone-500 mt-2">
                    or drag &amp; drop a .csv / .xlsx file here
                  </div>
                  {fileName && (
                    <div className="text-xs text-stone-700 mt-3">
                      Selected: <span className="font-mono">{fileName}</span>
                      {fileKind && (
                        <span className="ml-2 text-stone-500">
                          ({fileKind === 'xlsx' ? 'Excel' : 'CSV'})
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {previewLines.length > 0 && (
                  <div>
                    <div className="text-xs text-stone-500 mb-1">
                      Preview (first 5 rows){previewKind}
                    </div>
                    <pre className="bg-stone-50 border border-stone-200 rounded p-2 text-xs overflow-x-auto max-h-40">
                      {previewLines.join('\n')}
                      {csv.split(/\r?\n/).length > 6 && '\n…'}
                    </pre>
                  </div>
                )}

                {submitError && (
                  <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded">
                    {submitError}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={close}
                    className="px-3 py-1.5 text-sm rounded border border-stone-300 hover:bg-stone-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!csv.trim() || submitting}
                    className="px-3 py-1.5 text-sm rounded bg-qc-600 text-white hover:bg-qc-700 disabled:opacity-40"
                  >
                    {submitting ? 'Importing…' : 'Import'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div
                  className={`p-3 rounded border ${
                    result.created > 0
                      ? 'bg-green-50 border-green-200 text-green-800'
                      : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                  }`}
                >
                  <div className="font-medium">
                    {result.created > 0
                      ? `✓ Imported ${result.created} row${result.created === 1 ? '' : 's'}`
                      : '⚠ No rows imported'}
                  </div>
                  {result.errors.length > 0 && (
                    <div className="text-sm">
                      {result.errors.length} row
                      {result.errors.length === 1 ? '' : 's'} skipped:
                    </div>
                  )}
                </div>

                {result.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded">
                    <table className="w-full text-sm">
                      <thead className="bg-red-100 text-left text-red-900">
                        <tr>
                          <th className="px-3 py-2">Row</th>
                          <th className="px-3 py-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errors.map((e, i) => (
                          <tr key={i} className="border-t border-red-200">
                            <td className="px-3 py-2 font-mono">{e.row}</td>
                            <td className="px-3 py-2">{e.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={reset}
                    className="px-3 py-1.5 text-sm rounded border border-stone-300 hover:bg-stone-50"
                  >
                    Import another file
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="px-3 py-1.5 text-sm rounded bg-qc-600 text-white hover:bg-qc-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
