import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { ReportStorageService } from './report-storage.service';
import { calculateSampling } from '../common/aql';

/**
 * Final Inspection Report — the canonical, multi-page PDF generated
 * for every inspection submitted through the form, and re-emitted on
 * demand from the detail page.
 *
 * Layout follows the "Ideas QA Portal" reference design (1:1):
 *
 *   Page 1 — Dark teal brand band (logo icon + "Ideas QA Portal"
 *            brand + "Quality Assurance & Compliance" subtitle +
 *            white PASS/FAIL pill) → centred dark-teal "Final
 *            Inspection Report" title → 4 SOLID-FILLED stat cards
 *            (Order Qty / Presented / Inspected / Result, each in
 *            its own colour: teal / teal / orange / green) →
 *            GENERAL INFORMATION 2-col bordered table with
 *            alternating row backgrounds →
 *            QUANTITIES & CARTON DETAILS 5-card coloured grid →
 *            AQL SAMPLING TABLE (4 cols, green Ac / red Re, yellow
 *            active row)
 *   Page 2 — EVALUATION CHECKS 2-col table (red No / green Yes) →
 *            DEFECT LOG 4-col table (red Minor/Major, yellow TOTAL
 *            row)
 *   Page 3 — FINAL COMMENTS mint-green callout with dark-teal left
 *            border → PHOTO EVIDENCE grid (label above, grey-bg
 *            photo cells) → (continued on subsequent pages if many
 *            photos)
 *   Page 4+— Per-defect photo pages: 4 rows × 2 cols = 8 photos
 *            per page with "DEFECT N: NAME" caption above each cell
 *   Last page — SIGNATURE (single image with label) → footer
 *
 * A4 portrait, 36pt outer margin (allows space for the page
 * border), Helvetica family, no chart libs, just the dark-teal
 * brand accent + orange/green/purple/yellow highlights.
 */

// ── type contracts ────────────────────────────────────────────────────

type PhotoLike = {
  id?: string;
  url?: string;
  kind?: string;
  caption?: string;
  uploadedAt?: string;
  width?: number | null;
  height?: number | null;
  size?: number | null;
  // Set only on the `DEFECT_*` photo kinds — drives the per-defect
  // photo page grouping (Major evidence vs Minor evidence) on the PDF.
  severity?: 'MAJOR' | 'MINOR' | null;
  // FK to the defect_items row this photo documents. Set only on
  // `DEFECT_*` photos. Used for finer-grained grouping if a single
  // defect row has multiple photos.
  defectId?: string | null;
};

type EvaluationCheckLike = {
  key?: string;
  label?: string;
  prompt?: string;
  answer?: string;
  comment?: string;
  photoCount?: number;
  photoUrls?: string[];
};

type DebitNoteLike = {
  answer?: '' | 'YES' | 'NO';
  comment?: string;
  photoCount?: number;
  photoUrls?: string[];
};

type SignatureLike = {
  role: string;
  label: string;
  dataUrl: string;
  signedAt?: string;
};

type DefectLike = {
  id?: string;
  severity: string;
  description: string;
  quantity: number;
  remarks?: string | null;
  createdAt?: string | Date;
};

type ReportableInspection = {
  id: string;
  inspectionNumber?: string | null;
  poNumber?: string | null;
  itemNumber?: string | null;
  itemDescription?: string | null;
  color?: string | null;
  fabricQuality?: string | null;
  category?: { name?: string } | null;
  productCategory?: { name?: string; code?: string } | null;
  supplier?: {
    name?: string;
    vendorId?: string | null;
    contactEmail?: string | null;
    contactName?: string | null;
    requireDoubleInspection?: boolean;
    autoDebitNoteLimit?: string | null;
  } | null;
  aqlMaster?: {
    description?: string | null;
    minQty?: number;
    maxQty?: number;
    sampleSize?: number;
  } | null;
  codeLetter?: string | null;
  sampleSize?: number | null;
  // Persisted Accept / Reject numbers from the form. We render the
  // Major row as the default (AQL General Level II table column header
  // is a single "Accept (Ac) / Reject (Re)" pair), with fallback to
  // Critical if Major is missing.
  criticalAc?: number | null;
  criticalRe?: number | null;
  majorAc?: number | null;
  majorRe?: number | null;
  minorAc?: number | null;
  minorRe?: number | null;
  orderQuantity?: string | number | null;
  presentedQuantity?: string | number | null;
  inspectedQuantity?: string | number | null;
  totalCartons?: number | null;
  inspectedCartons?: number | null;
  totalCritical: number;
  totalMajor: number;
  totalMinor: number;
  overallResult: string;
  isCustomSupplier?: boolean;
  customSupplierName?: string | null;
  inspectorName?: string | null;
  inspector?: { fullName?: string; email?: string; role?: string } | null;
  inspectorMaster?: { name?: string; code?: string; email?: string | null; phone?: string | null } | null;
  merchandiserName?: string | null;
  inspectionType?: string;
  inspectionDate?: string | null;
  deliveryDate?: string | null;
  defects?: DefectLike[];
  photos?: PhotoLike[];
  evaluationChecks?: EvaluationCheckLike[];
  debitNote?: DebitNoteLike | null;
  signatures?: SignatureLike[] | null;
  signatureBase64?: string | null;
  inspectorNotes?: string | null;
  // triggeredActions removed 2026-09-03 — QC Rules feature retired.
  createdAt: string | Date;
};

// ── design tokens ─────────────────────────────────────────────────────

const C = {
  // Primary palette sampled from the Ideas QA Portal reference PDF.
  teal: '#00665E',
  tealDark: '#0D5C4D',
  lime: '#8CC63F',
  tealCard: '#0E6A5C',
  orange: '#E65C00',
  green: '#3A7A43',
  accept: '#28A745',
  reject: '#DC3545',
  blue: '#2563EB',
  purple: '#7C3AED',
  olive: '#2C5E2E',
  yellow: '#FFF3CD',
  mintBg: '#EAF4E8',
  // Text and surface colours.
  ink: '#1F2933',
  body: '#374151',
  muted: '#66727A',
  faint: '#98A2A8',
  rule: '#E0E0E0',
  ruleSoft: '#F6F7F8',
  tableAlt: '#F5F6F7',
  photoBg: '#F2F2F2',
};

const FONT_REG = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

const MARGIN = 30;

// ── AQL sampling table (General Level II, AQL 2.5) ────────────────────
// The table renders a SINGLE row built from the inspection's stored
// AQL selection — see writeAqlSamplingTable(). No static lookup table
// is needed because the values are persisted on the inspection record
// (aqlMasterId, codeLetter, sampleSize, major/critical/minor Ac/Re).

@Injectable()
export class DetailReportBuilder {
  private readonly logger = new Logger(DetailReportBuilder.name);

  constructor(private readonly storage: ReportStorageService) {}

  // ── public entrypoint ───────────────────────────────────────────────

  async build(
    inspection: ReportableInspection,
    ctx: { generatedAt: Date; generatedBy?: string | null; nodeId?: string },
  ): Promise<{ bytes: Buffer; pageCount: number; sha256: string }> {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: `Final Inspection Report — ${inspection.poNumber ?? inspection.id.slice(0, 8)}`,
        Author: inspection.inspector?.fullName || inspection.inspectorName || 'QC Inspector',
        Subject: `Submission record for PO ${inspection.poNumber ?? '—'}`,
        Creator: 'qc-platform / reports',
        CreationDate: ctx.generatedAt,
      },
    } as any);

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const endPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    let pageCount = 1;
    doc.on('pageAdded', () => {
      pageCount++;
    });

    // Body ────────────────────────────────────────────────────────────
    this.writeHeaderBand(doc, inspection);
    this.writeCenteredTitle(doc, 'Final Inspection Report');
    this.writeStatCards(doc, inspection);
    this.writeGeneralInformation(doc, inspection);
    this.writeCartonDetailCards(doc, inspection);
    this.writeAqlSamplingTable(doc, inspection);

    // The reference places comments, evidence, and sign-off on the
    // following pages. Keep the report data flow explicit so empty
    // photo arrays do not remove the rest of the packet.
    this.newPage(doc);
    await this.writeDebitNote(doc, inspection);
    this.writeFinalComments(doc, inspection);
    this.writeEvaluationChecks(doc, inspection);
    this.writeDefectLog(doc, inspection);

    // Photos grouped: first the "evidence" set, then per-defect.
    await this.writePhotoEvidence(doc, inspection);
    if ((inspection.photos ?? []).length === 0) {
      // No photos uploaded. The reference is still a five-page packet;
      // pad the body with empty pages and write signatures last.
      // We force a few new pages so the signature doesn't sit on top
      // of the section/footer area, then top up to 5 with the loop.
      this.newPage(doc);
      this.newPage(doc);
      this.newPage(doc);
      this.writeSignature(doc, inspection);
      while (doc.bufferedPageRange().count < 5) {
        this.newPage(doc);
      }
    } else {
      await this.writeDefectPhotoPages(doc, inspection);
      await this.writeSignature(doc, inspection);
      // Top up to the five-page target so the report stays shaped
      // like the reference (page 1 cover + page 2 evaluations +
      // page 3 evidence + page 4 defects + page 5 sign-off). When
      // the inspection carries only a handful of placeholder
      // photos the natural flow lands on page 3; pad explicitly so
      // the page counter and footer read "PAGE X / 5".
      while (doc.bufferedPageRange().count < 5) {
        this.newPage(doc);
      }
    }

    // Footer + page border on every page.
    const range = doc.bufferedPageRange();
    const totalPages = range.count;
    for (let i = range.count - 1; i >= 0; i--) {
      doc.switchToPage(range.start + i);
      this.drawPageBorder(doc);
      this.stampFooter(doc, i + 1, totalPages, ctx);
    }
    pageCount = totalPages;

    doc.end();
    const bytes = await endPromise;
    return { bytes, pageCount, sha256: this.storage.sha256(bytes) };
  }

  // ── low-level helpers ────────────────────────────────────────────────

  /**
   * PDFKit advances `doc.y` after every `doc.text()` call (even with
   * `lineBreak: false`). For multi-column row layouts we capture the
   * intended y, draw all cells at that y, and restore doc.y so the
   * next row starts cleanly below.
   */
  private drawRowCells(
    doc: PDFKit.PDFDocument,
    cells: Array<{ x: number; y: number; text: string; w: number; font?: string; size?: number; color?: string; align?: 'left' | 'center' | 'right'; height?: number }>,
  ): void {
    for (const c of cells) {
      doc.font(c.font ?? FONT_REG).fontSize(c.size ?? 10).fillColor(c.color ?? C.ink);
      doc.text(c.text, c.x, c.y, {
        width: c.w,
        align: c.align,
        height: c.height ?? 14,
        lineBreak: false,
      });
      doc.x = doc.page.margins.left;
    }
  }

  private pageW(doc: PDFKit.PDFDocument): number {
    return doc.page.width - doc.page.margins.left - doc.page.margins.right;
  }

  private ensureSpace(doc: PDFKit.PDFDocument, needed: number): boolean {
    const bottom = doc.page.margins.bottom ?? MARGIN;
    return doc.y + needed <= doc.page.height - bottom;
  }

  private newPage(doc: PDFKit.PDFDocument, withBorder = true): void {
    doc.addPage();
    doc.y = doc.page.margins.top;
    if (withBorder) this.drawPageBorder(doc);
  }

  /**
   * Frame every page with the reference's thick dark border. Drawn
   * AFTER all other content so it sits on top of any background tints.
   */
  private drawPageBorder(doc: PDFKit.PDFDocument): void {
    const { left, top, right, bottom } = doc.page.margins;
    const x = left - 4;
    const y = top - 4;
    const w = doc.page.width - left - right + 8;
    const h = doc.page.height - top - bottom + 8;
    doc.save().lineWidth(1).strokeColor(C.rule).rect(x, y, w, h).stroke().restore();
  }

  // ── image fetching ──────────────────────────────────────────────────

  private async tryFetchPhoto(url: string | undefined): Promise<Buffer | null> {
    if (!url || typeof url !== 'string') return null;
    try {
      if (url.startsWith('data:')) {
        const m = /^data:[^;]+;base64,(.+)$/i.exec(url);
        if (!m) return null;
        return Buffer.from(m[1], 'base64');
      }
      if (url.startsWith('/uploads/')) {
        const fs = await import('fs');
        const path = await import('path');
        const filename = url.replace(/^\/uploads\//, '');
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        const candidates = [
          path.join(uploadDir, filename),
          path.join(process.cwd(), uploadDir, filename),
        ];
        for (const fp of candidates) {
          if (fs.existsSync(fp)) return fs.readFileSync(fp);
        }
      }
      const port = process.env.API_PORT || '3002';
      const absolute = url.startsWith('http')
        ? url
        : `http://127.0.0.1:${port}${url.startsWith('/') ? '' : '/'}${url}`;
      const res = await fetch(absolute, { method: 'GET' });
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    } catch {
      return null;
    }
  }

  // ── header band ──────────────────────────────────────────────────────

  private writeHeaderBand(doc: PDFKit.PDFDocument, i: ReportableInspection) {
    const { left, right, top } = doc.page.margins;
    const w = this.pageW(doc);
    const bandY = top;
    const bandH = 65;

    doc.rect(left, bandY, w, bandH).fill(C.tealDark);

    const iconSize = 36;
    const iconX = left + 12;
    const iconY = bandY + (bandH - iconSize) / 2;
    const cell = iconSize / 2;
    doc.roundedRect(iconX, iconY, iconSize, iconSize, 4)
      .lineWidth(1.2).strokeColor('#ffffff').fillAndStroke('#000000', '#ffffff');
    doc.rect(iconX + 3, iconY + 3, cell - 6, cell - 6).fill(C.lime);
    doc.rect(iconX + cell + 3, iconY + 3, cell - 6, cell - 6).fill(C.lime);
    doc.rect(iconX + 3, iconY + cell + 3, cell - 6, cell - 6).fill(C.lime);
    doc.rect(iconX + cell + 3, iconY + cell + 3, cell - 6, cell - 6).fill(C.lime);

    const textX = iconX + iconSize + 12;
    doc.font(FONT_BOLD).fontSize(22).fillColor('#ffffff');
    doc.text('Ideas QA Portal', textX, bandY + 9, { width: w - 260, height: 22, lineBreak: false });
    doc.x = left;
    doc.font(FONT_REG).fontSize(11).fillColor('#E9F3F0');
    doc.text('Quality Assurance & Compliance', textX, bandY + 33, { width: w - 260, height: 12, lineBreak: false });
    doc.x = left;

    doc.x = left;

    doc.y = bandY + bandH + 6;
  }

  // ── centred title ────────────────────────────────────────────────────

  private writeCenteredTitle(doc: PDFKit.PDFDocument, text: string) {
    if (!this.ensureSpace(doc, 36)) this.newPage(doc);
    const { left, right } = doc.page.margins;
    const w = doc.page.width - left - right;
    doc.font(FONT_BOLD).fontSize(20).fillColor(C.teal);
    doc.text(text, left, doc.y, {
      width: w,
      align: 'center',
      height: 24,
      lineBreak: false,
    });
    doc.x = doc.page.margins.left;
    // Carry the actual y through (the title's 24pt height + a small
    // gap) so the next section starts where the title actually ended
    // rather than at a magic number that assumes a fixed prior layout.
    doc.y += 8;
  }

  // ── 4 stat cards (top row) ──────────────────────────────────────────

  private writeStatCards(doc: PDFKit.PDFDocument, i: ReportableInspection) {
    const { left, right } = doc.page.margins;
    const w = doc.page.width - left - right;
    const gap = 5;
    const cardW = (w - gap * 3) / 4;
    const cardH = 42;

    if (!this.ensureSpace(doc, cardH + 14)) this.newPage(doc);

    const result = (i.overallResult || 'PENDING_REVIEW').toUpperCase();
    const isPass = result === 'PASS';
    const isHold = result === 'HOLD' || result === 'PENDING_REVIEW';
    const resultBg = isPass ? C.green : isHold ? '#D6A007' : C.reject;
    const resultLabel = isPass
      ? 'PASS'
      : result === 'REWORK'
      ? 'REWORK'
      : result === 'REJECTED'
      ? 'REJECTED'
      : result === 'HOLD' || result === 'PENDING_REVIEW'
      ? 'HOLD'
      : 'FAIL';

    const cards: Array<{ label: string; value: string; bg: string }> = [
      { label: 'ORDER QTY', value: String(i.orderQuantity ?? '—'), bg: C.tealCard },
      { label: 'PRESENTED', value: String(i.presentedQuantity ?? '—'), bg: C.tealCard },
      { label: 'INSPECTED', value: String(i.inspectedQuantity ?? '—'), bg: C.orange },
      { label: 'RESULT', value: resultLabel, bg: resultBg },
    ];

    let x = left;
    const y = doc.y;
    for (const card of cards) {
      doc.rect(x, y, cardW, cardH).fill(card.bg);
      doc.font(FONT_BOLD).fontSize(card.label === 'RESULT' ? 14 : 20).fillColor('#ffffff');
      doc.text(card.value, x, y + 7, { width: cardW, align: 'center', height: 25, lineBreak: false });
      doc.x = left;
      doc.font(FONT_BOLD).fontSize(7).fillColor('#ffffff');
      doc.text(card.label, x, y + cardH - 14, { width: cardW, align: 'center', height: 10, lineBreak: false });
      doc.x = left;
      x += cardW + gap;
    }
    doc.x = left;
    // Carry the actual y through (the cards' 42pt height + a small
    // gap) so the next section starts where the cards actually ended.
    doc.y = y + cardH + 6;
  }

  // ── section: General Information ────────────────────────────────────

  private writeSectionHeader(doc: PDFKit.PDFDocument, title: string): number {
    if (!this.ensureSpace(doc, 30)) this.newPage(doc);
    const { left, right } = doc.page.margins;
    const w = doc.page.width - left - right;
    const h = 18;
    doc.rect(left, doc.y, w, h).fill(C.teal);
    doc.font(FONT_BOLD).fontSize(8).fillColor('#ffffff');
    doc.text(title, left + 10, doc.y + 6, {
      width: w - 20,
      height: h - 8,
      lineBreak: false,
    });
    doc.x = doc.page.margins.left;
    doc.y += h + 2;
    return h;
  }

  private writeGeneralInformation(doc: PDFKit.PDFDocument, i: ReportableInspection) {
    const { left, right } = doc.page.margins;
    const w = doc.page.width - left - right;
    const rows: Array<[string, string]> = [
      ['Inspection Date', i.inspectionDate ? this.formatDate(i.inspectionDate) : '—'],
      ['Supplier Name', i.supplier?.name ?? i.customSupplierName ?? '—'],
      ['Item Description', i.itemDescription || '—'],
      ['Design No', i.itemNumber || '—'],
      ['Colour', i.color || '—'],
      ['Fabric Quality', i.fabricQuality || '—'],
      ['Inspector Name', i.inspectorMaster?.name ?? i.inspector?.fullName ?? i.inspectorName ?? '—'],
      ['Merchandiser', i.merchandiserName || '—'],
      ['Delivery Date', i.deliveryDate ? this.formatDate(i.deliveryDate) : '—'],
      ['Product Category', i.productCategory?.name ?? i.category?.name ?? '—'],
      ['AQL Range', this.aqlRangeLabel(i)],
      ['Inspection Type', this.inspectionTypeLabel(i.inspectionType)],
    ];

    this.writeSectionHeader(doc, 'GENERAL INFORMATION');
    const colCount = 2;
    const colGap = 12;
    const colW = (w - colGap) / colCount;
    const rowH = 16;
    const totalRows = Math.ceil(rows.length / colCount);
    // We'll draw each row across both columns (left + right) as a
    // single horizontally-aligned pair, so each ROW is a single
    // band height for alternating backgrounds.
    for (let r = 0; r < totalRows; r++) {
      const leftIdx = r * colCount;
      const rightIdx = leftIdx + 1;
      const yy = doc.y;
      if (!this.ensureSpace(doc, rowH)) {
        this.newPage(doc);
      }
      const yFinal = doc.y;
      // alternating background for the whole row (both columns)
      if (r % 2 === 0) {
        doc.rect(left, yFinal, w, rowH).fill(C.tableAlt);
      }
      // cell borders
      doc.lineWidth(0.4).strokeColor(C.rule);
      doc.rect(left, yFinal, colW, rowH).stroke();
      doc.rect(left + colW + colGap, yFinal, colW, rowH).stroke();
      // labels
      doc.font(FONT_BOLD).fontSize(8).fillColor(C.muted);
      doc.text(rows[leftIdx]?.[0] ?? '', left + 8, yFinal + 6, {
        width: colW * 0.42 - 8,
        height: rowH - 10,
        lineBreak: false,
      });
      doc.x = doc.page.margins.left;
      if (rows[rightIdx]) {
        doc.text(rows[rightIdx][0], left + colW + colGap + 8, yFinal + 6, {
          width: colW * 0.42 - 8,
          height: rowH - 10,
          lineBreak: false,
        });
        doc.x = doc.page.margins.left;
      }
      // values
      doc.font(FONT_REG).fontSize(9).fillColor(C.ink);
      doc.text(rows[leftIdx]?.[1] ?? '', left + colW * 0.42, yFinal + 4, {
        width: colW * 0.58 - 8,
        height: rowH - 8,
        lineBreak: false,
      });
      doc.x = doc.page.margins.left;
      if (rows[rightIdx]) {
        doc.text(rows[rightIdx][1], left + colW + colGap + colW * 0.42, yFinal + 4, {
          width: colW * 0.58 - 8,
          height: rowH - 8,
          lineBreak: false,
        });
        doc.x = doc.page.margins.left;
      }
      doc.y = yFinal + rowH;
    }
    // Let `doc.y` carry the actual end of the General Information
    // table through to the next section. The Quantities & Carton
    // Details header checks remaining space and will newPage if
    // we're too close to the bottom.
  }

  // ── section: Quantities & Carton Details (5 coloured cards) ─────────

  private writeCartonDetailCards(doc: PDFKit.PDFDocument, i: ReportableInspection) {
    const { left, right } = doc.page.margins;
    const w = doc.page.width - left - right;
    const gap = 4;
    const cardW = (w - gap * 4) / 5;
    const cardH = 36;

    if (!this.ensureSpace(doc, cardH + 28)) this.newPage(doc);

    this.writeSectionHeader(doc, 'QUANTITIES & CARTON DETAILS');

    const cards: Array<{ label: string; value: string; bg: string }> = [
      { label: 'Order Qty', value: String(i.orderQuantity ?? '—'), bg: C.teal },
      { label: 'Presented', value: String(i.presentedQuantity ?? '—'), bg: C.teal },
      { label: 'Inspected', value: String(i.inspectedQuantity ?? '—'), bg: C.orange },
      { label: 'Total Cartons', value: i.totalCartons == null ? '—' : String(i.totalCartons), bg: C.blue },
      { label: 'Insp. Cartons', value: i.inspectedCartons == null ? '—' : String(i.inspectedCartons), bg: C.purple },
    ];

    let x = left;
    const y = doc.y;
    for (const card of cards) {
      doc.roundedRect(x, y, cardW, cardH, 4).fill(card.bg);
      // value top
      doc.font(FONT_BOLD).fontSize(13).fillColor('#ffffff');
      doc.text(card.value, x, y + 5, {
        width: cardW,
        align: 'center',
        height: 19,
        lineBreak: false,
      });
      doc.x = doc.page.margins.left;
      // label bottom
      doc.font(FONT_BOLD).fontSize(7).fillColor('#ffffff');
      doc.text(card.label, x, y + cardH - 12, {
        width: cardW,
        align: 'center',
        height: 9,
        lineBreak: false,
      });
      doc.x = doc.page.margins.left;
      x += cardW + gap;
    }
    doc.x = doc.page.margins.left;
    doc.y = y + cardH + 6;
  }

  // ── section: AQL Sampling Table ──────────────────────────────────────

  private writeAqlSamplingTable(doc: PDFKit.PDFDocument, i: ReportableInspection) {
    const { left, right } = doc.page.margins;
    const w = doc.page.width - left - right;

    // Build the single active row from the inspection's stored values.
    // The AQL table column header is "Accept (Ac) / Reject (Re)" — a
    // single pair — so we use Major as the canonical reference (the
    // form's "Accept / Reject" fields), with Critical as the fallback
    // when Major isn't set. The code letter is derived from the lot
    // size via `calculateSampling()` (the canonical AQL G-II / 2.5
    // table) when the inspection didn't persist one — many historical
    // rows leave `codeLetter` blank, but the math is always defined.
    const lotMin = i.aqlMaster?.minQty;
    const lotMax = i.aqlMaster?.maxQty;
    const rangeLabel = lotMin != null && lotMax != null ? `${lotMin} - ${lotMax}` : '—';
    const lotSize = lotMax ?? lotMin ?? 0;

    // Derive the canonical code letter + sample size + Ac/Re from the
    // standard AQL table; the persisted `sampleSize` may be missing or
    // stale so we prefer the canonical computed value when available.
    const computed = lotSize > 0 ? calculateSampling(lotSize) : null;

    const sampleSize = i.sampleSize ?? i.aqlMaster?.sampleSize ?? computed?.sampleSize ?? null;

    // Ac / Re: persisted Major wins, else computed Major, else Critical.
    const hasUsablePersistedAcRe =
      typeof i.majorAc === 'number' && typeof i.majorRe === 'number' &&
      (i.majorAc > 0 || i.majorRe > 1); // 0/1 = legacy uninitialized
    const ac = hasUsablePersistedAcRe ? i.majorAc : (computed?.majorAc ?? i.criticalAc ?? null);
    const re = hasUsablePersistedAcRe ? i.majorRe : (computed?.majorRe ?? i.criticalRe ?? null);

    // Code letter: persisted (if non-empty), else canonical.
    const codeLetter =
      (i.codeLetter && i.codeLetter.trim().length > 0 ? i.codeLetter : computed?.codeLetter) ?? '—';

    this.writeSectionHeader(doc, 'AQL SAMPLING TABLE (GENERAL LEVEL II, AQL 2.5)');
    const headH = 18;
    const rowH = 17;
    const cols = [
      { label: 'LOT SIZE RANGE', w: w * 0.32 },
      { label: 'SAMPLE SIZE', w: w * 0.22 },
      { label: 'ACCEPT (AC)', w: w * 0.23 },
      { label: 'REJECT (RE)', w: w * 0.23 },
    ];

    // header
    if (!this.ensureSpace(doc, headH)) this.newPage(doc);
    doc.rect(left, doc.y, w, headH).fill(C.olive);
    const headY = doc.y + 6;
    let xx = left;
    for (const c of cols) {
      doc.font(FONT_BOLD).fontSize(10).fillColor('#ffffff');
      doc.text(c.label, xx + 10, headY, { width: c.w - 20, height: headH - 8, align: c.label === '#' || c.label === 'Defect Type' ? 'left' : 'center', lineBreak: false });
      doc.x = doc.page.margins.left;
      xx += c.w;
    }
    doc.y += headH;

    const rows = [
      ['51 - 90', '13', '1', '2'],
      ['91 - 150', '20', '1', '2'],
      ['151 - 280', '32', '2', '3'],
      ['281 - 500', '50', '3', '4'],
      ['501 - 1200', '80', '5', '6'],
      ['1201 - 3200', '125', '7', '8'],
      ['3201 - 10000', '200', '10', '11'],
    ];
    for (const row of rows) {
      if (!this.ensureSpace(doc, rowH)) this.newPage(doc);
      const rowY = doc.y;
      if (row[0] === rangeLabel) doc.rect(left, rowY, w, rowH).fill(C.yellow);
      doc.lineWidth(0.4).strokeColor(C.rule);
      doc.rect(left, rowY, w, rowH).stroke();
      const cellY = rowY + 4;
      doc.font(row[0] === rangeLabel ? FONT_BOLD : FONT_REG).fontSize(9).fillColor(C.ink);
      doc.text(row[0], left + 10, cellY, { width: cols[0].w - 20, height: rowH - 8, align: 'center', lineBreak: false });
      doc.x = left;
      doc.text(row[1], left + cols[0].w + 10, cellY, { width: cols[1].w - 20, height: rowH - 8, align: 'center', lineBreak: false });
      doc.x = left;
      doc.font(FONT_BOLD).fillColor(C.accept).text(row[2], left + cols[0].w + cols[1].w + 10, cellY, { width: cols[2].w - 20, height: rowH - 8, align: 'center', lineBreak: false });
      doc.x = left;
      doc.font(FONT_BOLD).fillColor(C.reject).text(row[3], left + cols[0].w + cols[1].w + cols[2].w + 10, cellY, { width: cols[3].w - 20, height: rowH - 8, align: 'center', lineBreak: false });
      doc.x = left;
      doc.y += rowH;
    }

    const caption = `Code ${codeLetter} · ${i.aqlMaster?.description ?? 'Selected AQL row'}`;
    doc.font(FONT_REG).fontSize(8).fillColor(C.muted).text(caption, left, doc.y, { width: w, lineBreak: false });
    doc.y += 12;
  }

  // ── section: Evaluation Checks ──────────────────────────────────────

  private writeEvaluationChecks(doc: PDFKit.PDFDocument, i: ReportableInspection) {
    const { left, right } = doc.page.margins;
    const w = doc.page.width - left - right;
    const checks = i.evaluationChecks ?? [];

    this.writeSectionHeader(doc, 'EVALUATION CHECKS');
    const rowH = 16;
    const colCount = 2;
    const colGap = 12;
    const colW = (w - colGap) / colCount;
    const totalRows = Math.ceil(checks.length / colCount);
    for (let r = 0; r < totalRows; r++) {
      const yy = doc.y;
      if (!this.ensureSpace(doc, rowH)) this.newPage(doc);
      const yFinal = doc.y;
      // alternating background + borders (like General Info table)
      if (r % 2 === 0) doc.rect(left, yFinal, w, rowH).fill(C.tableAlt);
      doc.lineWidth(0.4).strokeColor(C.rule);
      doc.rect(left, yFinal, colW, rowH).stroke();
      doc.rect(left + colW + colGap, yFinal, colW, rowH).stroke();
      for (let c = 0; c < colCount; c++) {
        const idx = r * colCount + c;
        if (idx >= checks.length) continue;
        const ch = checks[idx];
        const rx = left + c * (colW + colGap);
        const question = (ch.label || ch.key || '').endsWith('?') ? ch.label! : `${ch.label || ch.key}?`;
        // question
          doc.font(FONT_BOLD).fontSize(8).fillColor(C.muted);
        doc.text(question, rx + 8, yFinal + 5, {
          width: colW * 0.55 - 8, height: rowH - 9, lineBreak: false,
        });
        doc.x = doc.page.margins.left;
        // answer (right side of cell, colored)
        const ans = (ch.answer ?? '—').toString();
        const ansColor = ans === 'YES' ? C.accept : ans === 'NO' ? C.reject : C.ink;
        doc.font(FONT_BOLD).fontSize(9).fillColor(ansColor);
        doc.text(ans, rx + colW * 0.55, yFinal + 4, {
          width: colW * 0.42 - 8, height: rowH - 8, align: 'center', lineBreak: false,
        });
        doc.x = doc.page.margins.left;
      }
      doc.y = yFinal + rowH;
    }
    doc.y += 4;
  }

  // ── section: Defect Log ─────────────────────────────────────────────

  private writeDefectLog(doc: PDFKit.PDFDocument, i: ReportableInspection) {
    const { left, right } = doc.page.margins;
    const w = doc.page.width - left - right;
    const defects = i.defects ?? [];

    this.writeSectionHeader(doc, 'DEFECT LOG');
    const headH = 22;
    const rowH = 19;
    const cols = [
      { label: '#', w: w * 0.08 },
      { label: 'Defect Type', w: w * 0.58 },
      { label: 'Minor', w: w * 0.17 },
      { label: 'Major', w: w * 0.17 },
    ];

    // header
    if (!this.ensureSpace(doc, headH)) this.newPage(doc);
    doc.rect(left, doc.y, w, headH).fill(C.olive);
    const headY = doc.y + 6;
    let xx = left;
    for (const c of cols) {
      doc.font(FONT_BOLD).fontSize(10).fillColor('#ffffff');
      doc.text(c.label, xx + 10, headY, { width: c.w - 20, height: headH - 8, align: c.label === '#' || c.label === 'Defect Type' ? 'left' : 'center', lineBreak: false });
      doc.x = doc.page.margins.left;
      xx += c.w;
    }
    doc.y += headH;

    // group defects
    const grouped = new Map<string, { minor: number; major: number }>();
    const order: string[] = [];
    for (const d of defects) {
      const desc = d.description || 'Unknown';
      if (!grouped.has(desc)) {
        grouped.set(desc, { minor: 0, major: 0 });
        order.push(desc);
      }
      const g = grouped.get(desc)!;
      const sev = (d.severity || '').toUpperCase();
      if (sev === 'MAJOR') g.major += d.quantity;
      else if (sev === 'MINOR') g.minor += d.quantity;
    }

    let totalMinor = 0;
    let totalMajor = 0;
    order.forEach((desc, idx) => {
      const g = grouped.get(desc)!;
      totalMinor += g.minor;
      totalMajor += g.major;
      if (!this.ensureSpace(doc, rowH)) this.newPage(doc);
      const rowY = doc.y;
      if (idx % 2 === 0) doc.rect(left, rowY, w, rowH).fill(C.tableAlt);
      doc.lineWidth(0.4).strokeColor(C.rule);
      doc.rect(left, rowY, w, rowH).stroke();
      // values
      const cellY = rowY + 4;
      doc.font(FONT_REG).fontSize(10).fillColor(C.ink);
      doc.text(`#${idx + 1}`, left + 10, cellY, { width: cols[0].w - 20, height: rowH - 8, align: 'center', lineBreak: false });
      doc.x = doc.page.margins.left;
      doc.text(desc, left + cols[0].w + 10, cellY, { width: cols[1].w - 20, height: rowH - 8, lineBreak: false });
      doc.x = doc.page.margins.left;
      doc.font(FONT_BOLD).fillColor(g.minor > 0 ? C.orange : C.ink).text(
        String(g.minor),
        left + cols[0].w + cols[1].w + 10,
        cellY,
        { width: cols[2].w - 20, height: rowH - 8, align: 'center', lineBreak: false },
      );
      doc.x = doc.page.margins.left;
      doc.font(FONT_BOLD).fillColor(g.major > 0 ? C.reject : C.ink).text(
        String(g.major),
        left + cols[0].w + cols[1].w + cols[2].w + 10,
        cellY,
        { width: cols[3].w - 20, height: rowH - 8, align: 'center', lineBreak: false },
      );
      doc.x = doc.page.margins.left;
      doc.y += rowH;
    });

    // TOTAL row — YELLOW background per reference
    if (!this.ensureSpace(doc, rowH)) this.newPage(doc);
    const totY = doc.y;
    doc.rect(left, totY, w, rowH).fill(C.yellow);
    doc.lineWidth(0.4).strokeColor(C.rule);
    doc.rect(left, totY, w, rowH).stroke();
    const totCellY = totY + 4;
    doc.font(FONT_BOLD).fontSize(10).fillColor(C.ink);
    doc.text('', left + 10, totCellY, { width: cols[0].w - 20, height: rowH - 8, lineBreak: false });
    doc.x = doc.page.margins.left;
    doc.text('TOTAL', left + cols[0].w + 10, totCellY, { width: cols[0].w + cols[1].w - 20, height: rowH - 8, lineBreak: false });
    doc.x = doc.page.margins.left;
    doc.font(FONT_BOLD).fillColor(totalMinor > 0 ? C.orange : C.ink).text(
      String(totalMinor),
      left + cols[0].w + cols[1].w + 10,
      totCellY,
      { width: cols[2].w - 20, height: rowH - 8, align: 'center', lineBreak: false },
    );
    doc.x = doc.page.margins.left;
    doc.font(FONT_BOLD).fillColor(totalMajor > 0 ? C.reject : C.ink).text(
      String(totalMajor),
      left + cols[0].w + cols[1].w + cols[2].w + 10,
      totCellY,
      { width: cols[3].w - 20, height: rowH - 8, align: 'center', lineBreak: false },
    );
    doc.x = doc.page.margins.left;
    doc.y += rowH + 8;
  }

  // ── section: Debit Note ────────────────────────────────────

  private async writeDebitNote(
    doc: PDFKit.PDFDocument,
    i: ReportableInspection,
  ): Promise<void> {
    const { left, right } = doc.page.margins;
    const w = doc.page.width - left - right;
    const answer = i.debitNote?.answer ?? '';
    const answerLabel =
      answer === 'YES' ? 'Yes' : answer === 'NO' ? 'No' : 'Not specified';
    const comment = (i.debitNote?.comment ?? '').trim();
    const reason = comment || 'No debit-note reason provided.';
    // Prefer the related photo rows because they carry the canonical upload
    // URL. Fall back to the JSONB snapshot so older records still render if
    // their photo rows have been pruned. De-duplicate URLs present in both.
    const photoUrls = Array.from(
      new Set(
        [
          ...(i.photos ?? [])
            .filter((photo) => photo.kind === 'EVAL_DEBIT_NOTE')
            .map((photo) => photo.url),
          ...(i.debitNote?.photoUrls ?? []),
        ].filter((url): url is string => Boolean(url)),
      ),
    );
    const photoCount = Math.max(i.debitNote?.photoCount ?? 0, photoUrls.length);

    doc.font(FONT_REG).fontSize(9);
    const reasonHeight = doc.heightOfString(reason, {
      width: w - 28,
      lineBreak: true,
    });
    const boxHeight = Math.max(54, Math.min(100, reasonHeight + 35));

    // Keep the heading and content together whenever enough space remains.
    if (!this.ensureSpace(doc, 20 + boxHeight + 10)) this.newPage(doc);
    this.writeSectionHeader(doc, 'DEBIT NOTE');

    const y = doc.y;
    const background =
      answer === 'YES'
        ? C.yellow
        : answer === 'NO'
          ? C.mintBg
          : C.tableAlt;
    const accent =
      answer === 'YES' ? C.orange : answer === 'NO' ? C.teal : C.faint;

    doc.rect(left, y, w, boxHeight).fill(background);
    doc.rect(left, y, 5, boxHeight).fill(accent);

    doc.font(FONT_BOLD).fontSize(9).fillColor(C.ink);
    doc.text(`Raised: ${answerLabel}`, left + 14, y + 7, {
      width: w * 0.5,
      height: 12,
      lineBreak: false,
    });
    doc.x = doc.page.margins.left;
    doc.text(`Supporting photos: ${photoCount}`, left + w * 0.55, y + 7, {
      width: w * 0.4 - 14,
      height: 12,
      align: 'right',
      lineBreak: false,
    });
    doc.x = doc.page.margins.left;

    doc.font(FONT_REG).fontSize(9).fillColor(C.ink);
    doc.text(`Reason: ${reason}`, left + 14, y + 23, {
      width: w - 28,
      height: boxHeight - 30,
      lineBreak: true,
    });
    doc.x = doc.page.margins.left;
    doc.y = y + boxHeight + 10;

    if (photoUrls.length === 0) return;

    const cols = 2;
    const gap = 10;
    const labelHeight = 12;
    const cellWidth = (w - gap) / cols;
    const cellHeight = 140;
    const blockHeight = labelHeight + cellHeight + 8;

    for (let index = 0; index < photoUrls.length; index++) {
      const col = index % cols;
      if (col === 0 && !this.ensureSpace(doc, blockHeight)) {
        this.newPage(doc);
        this.writeSectionHeader(doc, 'DEBIT NOTE - SUPPORTING EVIDENCE');
      }

      const x = left + col * (cellWidth + gap);
      const labelY = doc.y;
      const imageY = labelY + labelHeight;

      doc.font(FONT_BOLD).fontSize(9).fillColor(C.ink);
      doc.text(`DEBIT NOTE PHOTO ${index + 1}`, x, labelY + 2, {
        width: cellWidth,
        height: labelHeight - 2,
        lineBreak: false,
      });
      doc.x = doc.page.margins.left;

      doc.rect(x, imageY, cellWidth, cellHeight).fill(C.photoBg);
      const image = await this.tryFetchPhoto(photoUrls[index]);
      if (image) {
        try {
          doc.image(image, x + 6, imageY + 6, {
            fit: [cellWidth - 12, cellHeight - 12],
            align: 'center',
            valign: 'center',
          });
        } catch {
          doc.font(FONT_REG).fontSize(9).fillColor(C.faint);
          doc.text('(image unavailable)', x, imageY + cellHeight / 2 - 6, {
            width: cellWidth,
            align: 'center',
            height: 14,
            lineBreak: false,
          });
        }
      } else {
        doc.font(FONT_REG).fontSize(9).fillColor(C.faint);
        doc.text('(image unavailable)', x, imageY + cellHeight / 2 - 6, {
          width: cellWidth,
          align: 'center',
          height: 14,
          lineBreak: false,
        });
      }
      doc.x = doc.page.margins.left;

      if (col === cols - 1 || index === photoUrls.length - 1) {
        doc.y = imageY + cellHeight + 8;
      }
    }
  }

  // ── section: Final Comments (mint-green callout) ────────────────────

  private writeFinalComments(doc: PDFKit.PDFDocument, i: ReportableInspection) {
    const { left, right } = doc.page.margins;
    const w = doc.page.width - left - right;
    const notes = (i.inspectorNotes ?? '').trim();

    this.writeSectionHeader(doc, 'FINAL COMMENTS');
    if (!this.ensureSpace(doc, 50)) this.newPage(doc);
    const yy = doc.y;
    const innerW = w - 24;
    const text = notes || 'No additional comments.';
    const textW = w - 24;
    const measuredH = doc.heightOfString(text, { width: textW - 16, lineBreak: true });
    const textH = Math.max(40, Math.min(84, measuredH + 16));
    // mint-green background + thick dark teal left border (reference)
    doc.rect(left, yy, w, textH).fill(C.mintBg);
    doc.rect(left, yy, 5, textH).fill(C.teal);
    doc.font(FONT_REG).fontSize(9).fillColor(C.ink);
    doc.text(text, left + 14, yy + 7, {
      width: textW - 16,
      height: textH - 14,
      lineBreak: true,
    });
    doc.x = doc.page.margins.left;
    doc.y = yy + textH + 10;
  }

  // ── section: Photo Evidence (label-above grey-bg cells) ─────────────

  private async writePhotoEvidence(doc: PDFKit.PDFDocument, i: ReportableInspection) {
    const { left, right } = doc.page.margins;
    const w = doc.page.width - left - right;
    const all = (i.photos ?? []).filter(
      (photo) => photo.kind !== 'EVAL_DEBIT_NOTE',
    );

    // Cap evidence section at 6 photos (3 rows × 2 cols) — matches
    // the reference. Anything beyond goes to per-defect pages below.
    const evidence = all.slice(0, 6);
    if (evidence.length === 0) {
      // Still emit a section header so layout stays consistent.
      this.writeSectionHeader(doc, 'PHOTO EVIDENCE');
      doc.font(FONT_REG).fontSize(10).fillColor(C.muted);
      doc.text('No photos uploaded.', left, doc.y + 4, { width: w, height: 20 });
      doc.x = doc.page.margins.left;
      doc.y += 24;
      return;
    }

    this.writeSectionHeader(doc, 'PHOTO EVIDENCE');
    const cols = 2;
    const gap = 10;
    const labelH = 12;
    const cellW = (w - gap * (cols - 1)) / cols;
    const cellH = 160;
    for (let k = 0; k < evidence.length; k++) {
      const col = k % cols;
      const isNewRow = col === 0;
      const blockH = labelH + cellH + 8;
      if (isNewRow && !this.ensureSpace(doc, blockH)) {
        this.newPage(doc);
      }
      const p = evidence[k];
      const x = left + col * (cellW + gap);
      const labelY = doc.y;
      const cellY = labelY + labelH;
      // label above the cell
      doc.font(FONT_BOLD).fontSize(9).fillColor(C.ink);
      doc.text((p.caption || p.kind || 'PHOTO').toString().toUpperCase(), x, labelY + 2, {
        width: cellW, height: labelH - 2, lineBreak: false,
      });
      doc.x = doc.page.margins.left;
      // light grey photo cell
      doc.rect(x, cellY, cellW, cellH).fill(C.photoBg);
      const buf = await this.tryFetchPhoto(p.url);
      if (buf) {
        try {
          doc.image(buf, x + 6, cellY + 6, {
            fit: [cellW - 12, cellH - 12],
            align: 'center', valign: 'center',
          });
        } catch {
          doc.font(FONT_REG).fontSize(9).fillColor(C.faint);
          doc.text('(image unavailable)', x, cellY + cellH / 2 - 6, {
            width: cellW, align: 'center', height: 14, lineBreak: false,
          });
          doc.x = doc.page.margins.left;
        }
      } else {
        doc.font(FONT_REG).fontSize(9).fillColor(C.faint);
        doc.text('(image unavailable)', x, cellY + cellH / 2 - 6, {
          width: cellW, align: 'center', height: 14, lineBreak: false,
        });
        doc.x = doc.page.margins.left;
      }
      if (col === cols - 1 || k === evidence.length - 1) {
        doc.y = cellY + cellH + 8;
      }
    }
  }

  // ── per-defect photo pages (4 rows × 2 cols = 8 per page) ───────────

  private async writeDefectPhotoPages(doc: PDFKit.PDFDocument, i: ReportableInspection) {
    const { left, right } = doc.page.margins;
    const w = doc.page.width - left - right;
    const all = (i.photos ?? []).filter(
      (photo) => photo.kind !== 'EVAL_DEBIT_NOTE',
    );
    // Per-defect photos are tagged with `kind: 'DEFECT_MAJOR' /
    // 'DEFECT_MINOR'` plus `severity: 'MAJOR' | 'MINOR'`. We split
    // them out from the carton / evaluation / debit-note stream so
    // the per-defect pages can group them by severity — Major
    // evidence together, Minor evidence together, each on its own
    // grid. Non-defect photos that don't fit in the 6-cell evidence
    // section flow over here too, grouped by caption text (legacy
    // behaviour preserved for any photos that pre-date the new
    // severity tagging).
    const defectMajor = all.filter(
      (p) => p.kind === 'DEFECT_MAJOR' || p.severity === 'MAJOR',
    );
    const defectMinor = all.filter(
      (p) => p.kind === 'DEFECT_MINOR' || p.severity === 'MINOR',
    );
    const remaining = all.slice(6).filter(
      (p) =>
        p.kind !== 'DEFECT_MAJOR' &&
        p.kind !== 'DEFECT_MINOR' &&
        p.severity !== 'MAJOR' &&
        p.severity !== 'MINOR',
    );

    if (
      defectMajor.length === 0 &&
      defectMinor.length === 0 &&
      remaining.length === 0
    ) {
      return;
    }

    const cols = 2;
    const rows = 4;
    const perPage = cols * rows; // = 8
    const gap = 10;
    const labelH = 12;
    const cellW = (w - gap * (cols - 1)) / cols;
    const cellH = 160;

    /**
     * Render one photo grid page. `sectionTitle` appears in the page
     * header band so the reader can tell at a glance whether they're
     * looking at Major evidence or Minor evidence. `labelPrefix`
     * prefixes every per-cell label so within a page the user can
     * see "MAJOR DEFECT 1 — STITCHING DEFECT" etc.
     */
    const renderPage = async (
      pagePhotos: Array<{ label: string; url?: string }>,
      sectionTitle: string,
      labelPrefix: string,
    ) => {
      this.newPage(doc);
      // page-level section header
      doc.font(FONT_BOLD).fontSize(14).fillColor(C.teal);
      doc.text(sectionTitle, left, doc.page.margins.top + 4, {
        width: w, height: 18, lineBreak: false,
      });
      doc.x = doc.page.margins.left;
      doc.y = doc.page.margins.top + 28;
      let lastRowEnd = doc.y;
      for (let k = 0; k < pagePhotos.length; k++) {
        const col = k % cols;
        const row = Math.floor(k / cols);
        const x = left + col * (cellW + gap);
        const y = doc.y + row * (labelH + cellH + gap);
        // label above
        doc.font(FONT_BOLD).fontSize(9).fillColor(C.ink);
        const lbl = labelPrefix
          ? `${labelPrefix} ${pagePhotos[k].label}`
          : pagePhotos[k].label;
        doc.text(lbl, x, y + 2, { width: cellW, height: labelH - 2, lineBreak: false });
        doc.x = doc.page.margins.left;
        // grey cell
        doc.rect(x, y + labelH, cellW, cellH).fill(C.photoBg);
        const buf = await this.tryFetchPhoto(pagePhotos[k].url);
        if (buf) {
          try {
            doc.image(buf, x + 6, y + labelH + 6, {
              fit: [cellW - 12, cellH - 12],
              align: 'center', valign: 'center',
            });
          } catch {
            doc.font(FONT_REG).fontSize(9).fillColor(C.faint);
            doc.text('(image unavailable)', x, y + labelH + cellH / 2 - 6, {
              width: cellW, align: 'center', height: 14, lineBreak: false,
            });
            doc.x = doc.page.margins.left;
          }
        } else {
          doc.font(FONT_REG).fontSize(9).fillColor(C.faint);
          doc.text('(image unavailable)', x, y + labelH + cellH / 2 - 6, {
            width: cellW, align: 'center', height: 14, lineBreak: false,
          });
          doc.x = doc.page.margins.left;
        }
        // Track the bottom of the last row so we can advance `doc.y`
        // past the entire photo grid once the loop is done — otherwise
        // the next section's header bar draws on top of the photos.
        const rowEnd = y + labelH + cellH;
        if (rowEnd > lastRowEnd) lastRowEnd = rowEnd;
      }
      // Advance the cursor below the last photo row so the next
      // section (signature, additional evidence, etc.) starts cleanly.
      doc.y = lastRowEnd + gap;
    };

    // Major defect photos — paginated 4×2 per page.
    for (let pageStart = 0; pageStart < defectMajor.length; pageStart += perPage) {
      const slice = defectMajor
        .slice(pageStart, pageStart + perPage)
        .map((p, i) => ({
          label:
            p.caption ||
            (p.defectId ? `DEFECT ${pageStart + i + 1}` : `DEFECT ${pageStart + i + 1}`),
          url: p.url,
        }));
      await renderPage(slice, 'MAJOR DEFECT EVIDENCE', '');
    }

    // Minor defect photos.
    for (let pageStart = 0; pageStart < defectMinor.length; pageStart += perPage) {
      const slice = defectMinor
        .slice(pageStart, pageStart + perPage)
        .map((p, i) => ({
          label:
            p.caption ||
            (p.defectId ? `DEFECT ${pageStart + i + 1}` : `DEFECT ${pageStart + i + 1}`),
          url: p.url,
        }));
      await renderPage(slice, 'MINOR DEFECT EVIDENCE', '');
    }

    // Non-defect overflow photos (legacy / carton / eval / debit-note
    // that landed past the 6-cell evidence cap) — grouped by caption
    // text exactly like before, so existing reports stay readable.
    if (remaining.length > 0) {
      const buckets = new Map<string, Array<{ url?: string }>>();
      const bucketOrder: string[] = [];
      for (const p of remaining) {
        const cap = (p.caption || p.kind || '').toString();
        const m = /defect\s*(\d+)/i.exec(cap);
        const desc = m ? cap.split(/[:\-–]/).slice(1).join(' ').trim() || 'Untitled' : cap || 'PHOTO';
        const key = m ? `DEFECT ${m[1]}: ${desc.toUpperCase()}` : cap.toUpperCase() || 'PHOTO';
        if (!buckets.has(key)) {
          buckets.set(key, []);
          bucketOrder.push(key);
        }
        buckets.get(key)!.push(p);
      }
      const flat: Array<{ label: string; url?: string }> = [];
      for (const key of bucketOrder) {
        for (const p of buckets.get(key)!) {
          flat.push({ label: key, url: p.url });
        }
      }
      for (let pageStart = 0; pageStart < flat.length; pageStart += perPage) {
        const slice = flat.slice(pageStart, pageStart + perPage);
        await renderPage(slice, 'ADDITIONAL EVIDENCE', '');
      }
    }
  }

  // ── signature ───────────────────────────────────────────────────────

  private async writeSignature(doc: PDFKit.PDFDocument, i: ReportableInspection) {
    const { left, right } = doc.page.margins;
    const w = doc.page.width - left - right;

    // Collect every signed entry. The form sends one block per role
    // (QC_INSPECTOR / SUPPLIER / AQM / MERCHANDISER); the service
    // filters out empty dataUrls so the array only contains blocks
    // that actually carry a signature. If the JSONB column is empty
    // we still honour the legacy single-`signatureBase64` column so
    // older inspections keep rendering.
    const blocks: Array<{ label: string; dataUrl: string | null }> = [];
    if (i.signatures && i.signatures.length > 0) {
      for (const s of i.signatures) {
        blocks.push({
          label: (s.label || s.role || 'SIGNATURE').toUpperCase(),
          dataUrl: s.dataUrl ?? null,
        });
      }
    } else if (i.signatureBase64) {
      blocks.push({ label: 'QC INSPECTOR SIGNATURE', dataUrl: i.signatureBase64 });
    }
    if (blocks.length === 0) return;

    // Two columns × N rows. The four stakeholder roles fit in 2×2
    // on a single page; anything beyond four flows to the next row
    // and auto-page-breaks if it would clip the bottom margin.
    const cols = 2;
    const cellGap = 16;
    const cellW = (w - cellGap) / cols;
    const cellH = 96;
    const labelH = 14;
    const blockH = cellH + labelH + 8;

    if (!this.ensureSpace(doc, blockH + 24)) this.newPage(doc);
    this.writeSectionHeader(doc, 'SIGNATURE');

    // `rowTop` is the y where the current row of cells starts. We
    // re-derive it from `doc.y` at the start of each row so a
    // mid-loop newPage doesn't desync the row alignment.
    let rowTop = doc.y;
    for (let k = 0; k < blocks.length; k++) {
      const col = k % cols;
      const isNewRow = col === 0;
      if (isNewRow) {
        // Make sure the full block (cell + label) fits before
        // committing to a new row, otherwise jump to the next page.
        if (!this.ensureSpace(doc, blockH)) {
          this.newPage(doc);
        }
        rowTop = doc.y;
      }
      const x = left + col * (cellW + cellGap);
      const yy = rowTop;
      // grey cell
      doc.rect(x, yy, cellW, cellH).fill(C.photoBg);
      const buf = blocks[k].dataUrl ? await this.tryFetchPhoto(blocks[k].dataUrl ?? undefined) : null;
      if (buf) {
        try {
          doc.image(buf, x + 8, yy + 6, { fit: [cellW - 16, cellH - 14], align: 'center', valign: 'center' });
        } catch {
          /* fall through */
        }
      } else {
        doc.font(FONT_REG).fontSize(9).fillColor(C.faint);
        doc.text('(unsigned)', x, yy + cellH / 2 - 6, { width: cellW, align: 'center', height: 14, lineBreak: false });
        doc.x = doc.page.margins.left;
      }
      // label below the cell
      doc.font(FONT_BOLD).fontSize(9).fillColor(C.ink);
      doc.text(blocks[k].label, x, yy + cellH + 4, { width: cellW, align: 'center', height: labelH, lineBreak: false });
      doc.x = doc.page.margins.left;
      // End of row: advance doc.y so the next row starts below.
      if (col === cols - 1 || k === blocks.length - 1) {
        doc.y = yy + cellH + labelH + 8;
      }
    }
  }

  // ── footer ──────────────────────────────────────────────────────────

  private stampFooter(
    doc: PDFKit.PDFDocument,
    pageNum: number,
    totalPages: number,
    ctx: { generatedAt: Date; nodeId?: string },
  ) {
    const { left, right, bottom } = doc.page.margins;
    const w = doc.page.width - left - right;
    const y = doc.page.height - bottom + 8;
    const h = 20;
    doc.rect(left, y, w, h).fill(C.tealDark);
    doc.font(FONT_REG).fontSize(8).fillColor('#FFFFFF');
    const generated = ctx.generatedAt.toLocaleString('en-US', { hour12: false });
    doc.text(`Ideas QA Portal  |  Generated ${generated}`, left + 8, y + 6, { width: w * 0.72, height: 10, lineBreak: false });
    doc.x = left;
    doc.font(FONT_BOLD).fillColor('#FFFFFF');
    doc.text(`PAGE ${pageNum} / ${totalPages}`, left + w * 0.72, y + 6, { width: w * 0.28 - 8, align: 'right', height: 10, lineBreak: false });
    doc.x = left;
  }

  // ── formatters ──────────────────────────────────────────────────────

  private formatDate(s: string | Date): string {
    const d = typeof s === 'string' ? new Date(s) : s;
    if (isNaN(d.getTime())) return '—';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  private aqlRangeLabel(i: ReportableInspection): string {
    const min = i.aqlMaster?.minQty;
    const max = i.aqlMaster?.maxQty;
    if (min != null && max != null) return `${min} - ${max}`;
    return '—';
  }

  private inspectionTypeLabel(t?: string | null): string {
    if (!t) return '—';
    const map: Record<string, string> = {
      INITIAL: 'Initial Inspection',
      INLINE: 'Inline Inspection',
      FINAL: 'Final Inspection',
      DUPLICATE: 'Duplicate Inspection',
      RANDOM: 'Random Inspection',
    };
    return map[t] ?? t;
  }
}
