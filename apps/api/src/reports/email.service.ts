import { Injectable, Logger } from '@nestjs/common';
import { promises as fs, createReadStream } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ReportStorageService } from './report-storage.service';

export interface OutboundEmail {
  from: string;
  to: { name?: string; email: string }[];
  cc?: { name?: string; email: string }[];
  subject: string;
  body: string;
  /** Path to the on-disk PDF that should be attached. */
  attachmentPath: string;
  /** Original filename for the attachment (defaults to the basename). */
  attachmentName?: string;
}

/**
 * Sends an email with a PDF attachment.
 *
 * **Why this service exists even without SMTP**: the system needs a
 * reliable audit trail of *who got what report when* — independent of
 * whether the SMTP relay is configured. So this service does two
 * things:
 *
 *   1. Always writes the outgoing message as an `.eml` file under
 *      `<reports-storage>/eml-outbox/` so admins can re-open the
 *      exact message that went out, even if the SMTP relay was
 *      offline at the time.
 *
 *   2. If `SMTP_HOST` is set in the environment, also hands the
 *      message off via `nodemailer` (when available — the dependency
 *      is optional). If the SMTP transport rejects, the service
 *      still records the `.eml` drop but marks the email_event row
 *      FAILED so the audit trail shows the truth.
 *
 * To enable real SMTP, add `nodemailer` to apps/api/package.json
 * and set `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS`
 * / `SMTP_FROM`. Until then the dev / mock path is in effect.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly storage: ReportStorageService) {}

  /**
   * Send (or queue-and-log) the message. Returns the on-disk .eml path
   * so callers can persist it for the audit trail.
   */
  async send(message: OutboundEmail): Promise<{ emlPath: string; delivered: boolean }> {
    const eml = this.buildEml(message);
    const dropDir = path.join(this.storage.storageRoot, 'eml-outbox');
    await fs.mkdir(dropDir, { recursive: true });
    const fname = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.eml`;
    const emlPath = path.join(dropDir, fname);
    await fs.writeFile(emlPath, eml, 'utf8');

    // Best-effort SMTP relay — only if configured. We don't require
    // nodemailer to be installed because the .eml drop is enough for
    // the dev audit trail.
    const host = process.env.SMTP_HOST;
    if (host) {
      try {
        // Lazy-require so the module is optional.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          host,
          port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === '1',
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
        });
        await transporter.sendMail({
          from: message.from,
          to: message.to.map((r) => (r.name ? `"${r.name}" <${r.email}>` : r.email)).join(', '),
          cc: message.cc?.length
            ? message.cc.map((r) => (r.name ? `"${r.name}" <${r.email}>` : r.email)).join(', ')
            : undefined,
          subject: message.subject,
          text: message.body,
          attachments: [
            {
              filename: message.attachmentName ?? path.basename(message.attachmentPath),
              content: createReadStream(message.attachmentPath),
            },
          ],
        });
        this.logger.log(`Email relayed via SMTP: ${message.subject}`);
        return { emlPath, delivered: true };
      } catch (err) {
        this.logger.error(
          `SMTP relay failed for "${message.subject}": ${(err as Error).message}. .eml kept at ${emlPath}.`,
        );
        return { emlPath, delivered: false };
      }
    }

    this.logger.log(`Email written to .eml drop: ${emlPath}`);
    return { emlPath, delivered: false };
  }

  /**
   * Compose a minimal RFC 5322 message with a base64-encoded
   * attachment. Not a full RFC-5322 implementation — just enough
   * that admins can re-open the message in Outlook / Thunderbird
   * to see exactly what went out.
   */
  private buildEml(m: OutboundEmail): string {
    const boundary = `mixed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const filename = m.attachmentName ?? path.basename(m.attachmentPath);
    // Read attachment synchronously — these are small (a few hundred
    // KB per PDF), and .eml generation is rare (one per email
    // action). Avoids a separate code path.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fsSync = require('fs') as typeof import('fs');
    const bytes = fsSync.readFileSync(m.attachmentPath);
    const b64 = bytes.toString('base64');
    const now = new Date().toUTCString();
    const to = m.to
      .map((r) => (r.name ? `"${r.name.replace(/"/g, '')}" <${r.email}>` : r.email))
      .join(', ');
    const cc = m.cc?.length
      ? `\r\nCc: ${m.cc
          .map((r) => (r.name ? `"${r.name.replace(/"/g, '')}" <${r.email}>` : r.email))
          .join(', ')}`
      : '';
    const lines = [
      `From: ${m.from}`,
      `To: ${to}${cc}`,
      `Subject: ${m.subject}`,
      `Date: ${now}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="utf-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      m.body,
      '',
      `--${boundary}`,
      `Content-Type: application/pdf; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
    ];
    // Split base64 into 76-char lines (RFC 2045).
    for (let i = 0; i < b64.length; i += 76) {
      lines.push(b64.slice(i, i + 76));
    }
    lines.push('', `--${boundary}--`, '');
    return lines.join('\r\n');
  }
}
