import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as os from 'os';
import { calculateSampling } from '../common/aql';
import { InspectionsService } from '../inspections/inspections.service';
import {
  EmailEventEntity,
  EmailRecipient,
} from '../database/entities/email-event.entity';
import { ReportEntity } from '../database/entities/report.entity';
import { DetailReportBuilder } from './detail-report.builder';
import { EmailService } from './email.service';
import { ReportStorageService } from './report-storage.service';

/**
 * Reports module — owns the legacy single-page PDF (kept for the
 * inline download link on the detail page) and the new full detail
 * submission report used for record / audit / email.
 *
 * The new detail report lives alongside the legacy one — admins can
 * still hit `/reports/inspections/:id/pdf` for the quick summary,
 * and `/reports/inspections/:id/detail` for the complete submission
 * record used for record-keeping and external sharing.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly nodeId =
    process.env.NODE_ID || `${os.hostname?.() ?? 'node'}-${process.pid}`;

  constructor(
    @Inject(forwardRef(() => InspectionsService))
    private readonly inspectionsService: InspectionsService,
    private readonly storage: ReportStorageService,
    private readonly detail: DetailReportBuilder,
    private readonly email: EmailService,
    @InjectRepository(ReportEntity)
    private readonly reports: Repository<ReportEntity>,
    @InjectRepository(EmailEventEntity)
    private readonly emailEvents: Repository<EmailEventEntity>,
  ) {}

  // ── legacy single-page summary (unchanged surface, kept for the
  //    inline download link on the detail page). ─────────────────────

  async generateInspectionPdf(id: string): Promise<Buffer> {
    const i = await this.inspectionsService.getById(id);
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc
        .fontSize(20)
        .text('Quality Control Inspection Report', { align: 'center' });
      doc.moveDown();
      doc
        .fontSize(10)
        .fillColor('#666')
        .text(`Inspection ID: ${i.id}`, { align: 'center' });
      doc.moveDown(2);
      doc.fillColor('#000');

      this.label(doc, 'PO Number', i.poNumber || '—');
      this.label(doc, 'Item Number', i.itemNumber || '—');
      this.label(doc, 'Item Description', i.itemDescription || '—');
      this.label(doc, 'Category', i.category?.name ?? '—');
      this.label(doc, 'Supplier', i.supplier?.name ?? '—');
      if (i.isCustomSupplier) {
        this.label(doc, 'Custom Supplier', i.customSupplierName || '—');
      }
      this.label(
        doc,
        'AQL Master',
        i.aqlMaster
          ? `${i.aqlMaster.description} (lot ${i.aqlMaster.minQty}–${i.aqlMaster.maxQty})`
          : '—',
      );
      this.label(doc, 'Sample Size', `${i.sampleSize} (Code ${i.codeLetter || '—'})`);
      const acRe = calculateSampling(i.sampleSize);
      this.label(
        doc,
        'AC/RE',
        `Crit ${acRe.criticalAc}/${acRe.criticalRe} · Major ${acRe.majorAc}/${acRe.majorRe} · Minor ${acRe.minorAc}/${acRe.minorRe}`,
      );
      doc.moveDown();

      doc.fontSize(14).text('Defect Summary');
      doc.moveDown(0.5);
      doc
        .fontSize(11)
        .text(`Critical: ${i.totalCritical}`)
        .text(`Major: ${i.totalMajor}`)
        .text(`Minor: ${i.totalMinor}`);
      doc.moveDown();

      if (i.defects?.length > 0) {
        doc.fontSize(14).text('Defects');
        doc.moveDown(0.5);
        for (const d of i.defects) {
          doc
            .fontSize(10)
            .text(
              `• [${d.severity}] ${d.description} (qty ${d.quantity})${d.remarks ? ` — ${d.remarks}` : ''}`,
            );
        }
        doc.moveDown();
      }

      if (i.inspectorNotes) {
        doc.fontSize(14).text('Inspector Notes');
        doc.moveDown(0.5);
        doc.fontSize(10).text(i.inspectorNotes);
        doc.moveDown();
      }

      const resultColor =
        i.overallResult === 'PASS'
          ? '#0a7d3b'
          : i.overallResult === 'REWORK' || i.overallResult === 'HOLD'
          ? '#b45309'
          : i.overallResult === 'REJECTED'
          ? '#7c2d12'
          : '#b91c1c';
      doc
        .fontSize(16)
        .fillColor(resultColor)
        .text(`Result: ${i.overallResult}`, { align: 'center' });
      doc.moveDown();

      // Triggered Actions render block removed 2026-09-03 — QC Rules
      // feature retired. The triggeredActions column on inspections is
      // being dropped via migration
      // 1700000025000-DropQcRulesAndTriggeredActions.

      const sigs: { label: string; dataUrl: string }[] =
        i.signatures && i.signatures.length > 0
          ? i.signatures.map((s: any) => ({
              label: s.label,
              dataUrl: s.dataUrl,
            }))
          : i.signatureBase64
          ? [{ label: 'Inspector Signature', dataUrl: i.signatureBase64 }]
          : [];
      if (sigs.length > 0) {
        doc.fontSize(12).fillColor('#000').text('Signatures', { underline: true });
        doc.moveDown(0.3);
        for (const s of sigs) {
          doc.fontSize(9).fillColor('#374151').text(s.label);
          try {
            const b64 = s.dataUrl.replace(/^data:image\/\w+;base64,/, '');
            const buf = Buffer.from(b64, 'base64');
            doc.image(buf, { fit: [180, 60] });
          } catch {
            doc.fontSize(8).fillColor('#9ca3af').text('(signature unavailable)');
          }
          doc.moveDown(0.4);
        }
        doc.fillColor('#000');
      }

      doc.end();
    });
  }

  // ── new detail submission report ──────────────────────────────────

  /**
   * Generate the detail PDF, persist it on disk + in the DB, return
   * the new report row. Auto-archive calls this without a `generatedBy`.
   */
  async generateDetailReport(
    inspectionId: string,
    opts: { kind: 'AUTO_SUBMIT' | 'MANUAL_DOWNLOAD' | 'EMAIL_ATTACHMENT'; generatedBy?: string | null },
  ): Promise<ReportEntity> {
    const inspection = await this.inspectionsService.getById(inspectionId);
    if (!inspection) throw new NotFoundException(`Inspection ${inspectionId} not found`);
    const generatedAt = new Date();
    const { bytes, pageCount, sha256 } = await this.detail.build(inspection, {
      generatedAt,
      generatedBy: opts.generatedBy ?? null,
      nodeId: this.nodeId,
    });

    // Allocate a placeholder storage path so the row insert doesn't
    // violate the NOT NULL constraint on `storage_path`. The actual
    // file write happens below at the canonical location.
    const placeholderId = 'pending-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const tempPath = this.storage.newPath(inspectionId, placeholderId);
    const row = this.reports.create({
      inspectionId,
      kind: opts.kind,
      sha256,
      byteSize: bytes.length,
      pageCount,
      storagePath: tempPath.relative,
      generatedBy: opts.generatedBy ?? null,
    });
    const saved = await this.reports.save(row);

    // Now that we have the real row id, write the file at the
    // canonical location and update the row to point at it. Only the
    // placeholder *file* (not its parent dir — the parent dir holds
    // the canonical file too) gets removed.
    const finalPath = this.storage.newPath(inspectionId, saved.id);
    this.storage.write(finalPath.absolute, bytes);
    if (finalPath.absolute !== tempPath.absolute) {
      try {
        const fs = require('fs') as typeof import('fs');
        if (fs.existsSync(tempPath.absolute)) fs.unlinkSync(tempPath.absolute);
      } catch {
        /* best-effort */
      }
    }

    saved.storagePath = finalPath.relative;
    return this.reports.save(saved);
  }

  /**
   * Stream the on-disk PDF for an existing report row, or 404 if the
   * file is missing (corrupted archive — admin can regenerate).
   */
  async streamReport(reportId: string): Promise<{
    bytes: Buffer;
    filename: string;
    report: ReportEntity;
  }> {
    const report = await this.reports.findOne({ where: { id: reportId } });
    if (!report) throw new NotFoundException(`Report ${reportId} not found`);
    if (!this.storage.exists(report.storagePath)) {
      throw new NotFoundException(
        `Report ${reportId} is missing on disk — please regenerate.`,
      );
    }
    const inspection = await this.inspectionsService.getById(
      report.inspectionId,
    );
    return {
      bytes: this.storage.read(report.storagePath),
      filename: this.buildDetailReportFilename(
        inspection.inspectionNumber,
        report.inspectionId,
        reportId,
      ),
      report,
    };
  }

  /**
   * Stream the most recent detail report for an inspection, generating
   * one if none exists. Used by the inline "Download detail report"
   * button on the detail page.
   */
  async getOrGenerateLatest(
    inspectionId: string,
    generatedBy?: string | null,
  ): Promise<{ bytes: Buffer; filename: string; report: ReportEntity }> {
    const latest = await this.reports.findOne({
      where: { inspectionId },
      order: { createdAt: 'DESC' },
    });
    if (latest && this.storage.exists(latest.storagePath)) {
      const inspection = await this.inspectionsService.getById(inspectionId);
      return {
        bytes: this.storage.read(latest.storagePath),
        filename: this.buildDetailReportFilename(
          inspection.inspectionNumber,
          inspectionId,
          latest.id,
        ),
        report: latest,
      };
    }
    const fresh = await this.generateDetailReport(inspectionId, {
      kind: 'MANUAL_DOWNLOAD',
      generatedBy: generatedBy ?? null,
    });
    const inspection = await this.inspectionsService.getById(inspectionId);
    return {
      bytes: this.storage.read(fresh.storagePath),
      filename: this.buildDetailReportFilename(
        inspection.inspectionNumber,
        inspectionId,
        fresh.id,
      ),
      report: fresh,
    };
  }

  /**
   * Always build a fresh PDF using the current builder, regardless of
   * what is cached on disk. The previous report row stays in the
   * audit trail (`kind: MANUAL_DOWNLOAD`, new `createdAt`) so admins
   * can still see the history.
   *
   * Wired to `?regenerate=1` on the detail endpoint so the View
   * Report button reflects the latest builder, never a stale cache
   * left over from an earlier version.
   */
  async regenerateLatest(
    inspectionId: string,
    generatedBy?: string | null,
  ): Promise<{ bytes: Buffer; filename: string; report: ReportEntity }> {
    const fresh = await this.generateDetailReport(inspectionId, {
      kind: 'MANUAL_DOWNLOAD',
      generatedBy: generatedBy ?? null,
    });
    const inspection = await this.inspectionsService.getById(inspectionId);
    return {
      bytes: this.storage.read(fresh.storagePath),
      filename: this.buildDetailReportFilename(
        inspection.inspectionNumber,
        inspectionId,
        fresh.id,
      ),
      report: fresh,
    };
  }

  // ── manual email ──────────────────────────────────────────────────

  /**
   * Generate a fresh detail PDF and email it as an attachment.
   * Returns the new email-event row (including its .eml drop path).
   */
  async emailDetailReport(
    inspectionId: string,
    input: {
      recipients: EmailRecipient[];
      subject: string;
      body: string;
      sentBy: string | null;
    },
  ): Promise<EmailEventEntity> {
    if (!input.recipients || input.recipients.length === 0) {
      throw new BadRequestException('At least one recipient is required.');
    }
    const inspection = await this.inspectionsService.getById(inspectionId);
    if (!inspection) throw new NotFoundException(`Inspection ${inspectionId} not found`);
    if (!input.subject.trim()) {
      throw new BadRequestException('Subject is required.');
    }

    // 1) Generate a fresh PDF specifically for this email — every
    //    outbound email gets its own snapshot so the attachment can
    //    be cross-referenced to the email_event row.
    const report = await this.generateDetailReport(inspectionId, {
      kind: 'EMAIL_ATTACHMENT',
      generatedBy: input.sentBy,
    });

    // 2) Compose the email — split recipients into TO/CC/BCC roles.
    const to = input.recipients.filter((r) => r.role !== 'CC' && r.role !== 'BCC');
    const cc = input.recipients.filter((r) => r.role === 'CC');
    if (to.length === 0) {
      throw new BadRequestException('At least one TO recipient is required.');
    }

    // 3) Persist the event row first (QUEUED), then attempt delivery.
    const event = this.emailEvents.create({
      inspectionId,
      reportId: report.id,
      subject: input.subject,
      body: input.body,
      recipients: input.recipients,
      recipientSummary: input.recipients
        .map((r) => `${r.email}${r.role !== 'TO' ? ` (${r.role})` : ''}`)
        .join(', '),
      status: 'QUEUED',
      sentBy: input.sentBy,
    });
    const savedEvent = await this.emailEvents.save(event);

    const from = process.env.SMTP_FROM || 'qc-noreply@qc.local';
    const result = await this.email.send({
      from,
      to: to.map((r) => ({ name: r.name, email: r.email })),
      cc: cc.map((r) => ({ name: r.name, email: r.email })),
      subject: input.subject,
      body: input.body,
      attachmentPath: this.storage.resolve(report.storagePath),
      attachmentName: this.buildDetailReportFilename(
        inspection.inspectionNumber,
        inspectionId,
        report.id,
      ),
    });

    savedEvent.emlPath = result.emlPath;
    savedEvent.status = result.delivered ? 'SENT' : 'FAILED';
    savedEvent.sentAt = result.delivered ? new Date() : null;
    if (!result.delivered) {
      savedEvent.errorMessage =
        'SMTP relay not configured — message kept in .eml drop only.';
    }
    return this.emailEvents.save(savedEvent);
  }

  // ── audit trail ───────────────────────────────────────────────────

  async listReports(inspectionId: string): Promise<ReportEntity[]> {
    return this.reports.find({
      where: { inspectionId },
      order: { createdAt: 'DESC' },
    });
  }

  async listEmailEvents(inspectionId: string): Promise<EmailEventEntity[]> {
    return this.emailEvents.find({
      where: { inspectionId },
      order: { createdAt: 'DESC' },
    });
  }

  private buildDetailReportFilename(
    inspectionNumber: string | null | undefined,
    inspectionId: string,
    reportId: string,
  ): string {
    const safeInspectionNumber = (inspectionNumber ?? '')
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const inspectionPart = safeInspectionNumber
      ? `${safeInspectionNumber}-${inspectionId.slice(0, 8)}`
      : inspectionId.slice(0, 8);

    return `inspection-detail-${inspectionPart}-${reportId.slice(0, 8)}.pdf`;
  }

  private label(doc: PDFKit.PDFDocument, label: string, value: string) {
    doc.fontSize(10).fillColor('#444').text(`${label}: `, { continued: true });
    doc.fillColor('#000').text(value);
  }
}
