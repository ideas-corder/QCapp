/**
 * Tiny RFC-4180-ish CSV parser used by bulk-import endpoints.
 *
 * Supports:
 *   - quoted fields ("…")
 *   - escaped quotes ("")
 *   - CRLF or LF line endings
 *   - trailing newlines
 *
 * Returns rows as Record<header, string>. Header lookup is case-insensitive
 * (caller passes headerMap: { csvHeader → canonicalKey }) so editors can
 * present friendly CSV headers like "Auto Debit Note Limit" while we still
 * feed "autoDebitNoteLimit" into validators.
 */
export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

export function parseCsv(text: string): ParsedCsv {
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      // swallow; the \n that follows ends the record
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      field = '';
      records.push(row);
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // flush trailing field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  // drop empty trailing rows
  while (
    records.length > 0 &&
    records[records.length - 1].every((c) => c.trim() === '')
  ) {
    records.pop();
  }

  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < records.length; r++) {
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (records[r][c] ?? '').trim();
    }
    rows.push(obj);
  }
  return { headers, rows };
}

/** Look up a value by either the exact header or a case/space-insensitive match. */
export function pick(row: Record<string, string>, ...names: string[]): string {
  for (const k of Object.keys(row)) {
    const norm = k.toLowerCase().replace(/[\s_-]+/g, '');
    for (const n of names) {
      if (k === n) return row[k];
      if (norm === n.toLowerCase().replace(/[\s_-]+/g, '')) return row[k];
    }
  }
  return '';
}

export function toBool(v: string): boolean | null {
  const s = v.toLowerCase().trim();
  if (!s) return null;
  if (['true', '1', 'yes', 'y', 't'].includes(s)) return true;
  if (['false', '0', 'no', 'n', 'f'].includes(s)) return false;
  return null;
}

export function toNumber(v: string): number | null {
  if (!v || !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
