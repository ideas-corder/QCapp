import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guards/roles.guard';
import { ReportsService } from './reports.service';
import {
  EmailEventEntity,
  EmailRecipient,
} from '../database/entities/email-event.entity';
import { ReportEntity } from '../database/entities/report.entity';

interface EmailBodyDto {
  recipients: EmailRecipient[];
  subject: string;
  body: string;
}

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Legacy one-page summary PDF — kept inline on the detail page.
   * Admins and inspectors can both pull it.
   */
  @Get('inspections/:id/pdf')
  @Roles('admin', 'inspector', 'viewer')
  async inspectionPdf(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.reportsService.generateInspectionPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="inspection-${id}.pdf"`,
    );
    res.send(pdf);
  }

  /**
   * Detail submission report (complete, multi-section). Auto-archive
   * on submit creates one; this endpoint materialises a fresh PDF
   * on demand and streams it.
   *
   * Pass `?regenerate=1` to bypass the on-disk cache and build a
   * brand-new PDF with the current builder. This is the path the
   * View Report button uses so admins always see the latest layout,
   * not a 1-day-old snapshot from when the inspection was submitted.
   */
  @Get('inspections/:id/detail')
  @Roles('admin', 'inspector', 'viewer')
  async inspectionDetail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('regenerate') regenerate: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const userId = (req as any)?.user?.id ?? null;
    const force = regenerate === '1' || regenerate === 'true';
    const { bytes, filename } = force
      ? await this.reportsService.regenerateLatest(id, userId)
      : await this.reportsService.getOrGenerateLatest(id, userId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    // Tell the browser to never cache this PDF — every click of the
    // View Report / Download detail report button should materialise a
    // fresh file from the API, not serve a stale copy from disk cache.
    // Without this header Chrome (and the PDF viewer it embeds) was
    // re-using old PDFs across sessions, which made it look like the
    // photo cells weren't being fixed when they actually had been.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(bytes);
  }

  /**
   * Stream a specific report by id — useful when the audit trail
   * shows multiple reports for an inspection (auto-archive +
   * download + email attachments).
   */
  @Get(':reportId/pdf')
  @Roles('admin', 'inspector', 'viewer')
  async reportById(
    @Param('reportId', new ParseUUIDPipe()) reportId: string,
    @Res() res: Response,
  ) {
    const { bytes, filename } = await this.reportsService.streamReport(reportId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(bytes);
  }

  /**
   * Manual email: generate a fresh PDF, attach it, and queue the
   * outgoing message (SMTP if configured, else .eml drop only).
   */
  @Post('inspections/:id/email')
  @Roles('admin', 'inspector')
  async emailDetail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: EmailBodyDto,
    @Req() req: Request,
  ): Promise<EmailEventEntity> {
    const userId = (req as any)?.user?.id ?? null;
    return this.reportsService.emailDetailReport(id, {
      recipients: body.recipients,
      subject: body.subject,
      body: body.body,
      sentBy: userId,
    });
  }

  /**
   * Audit trail for an inspection — every report generated and every
   * email sent. The detail page renders this list below the form so
   * admins can see what was archived and who got the report.
   */
  @Get('inspections/:id/audit')
  @Roles('admin', 'inspector', 'viewer')
  async audit(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ reports: ReportEntity[]; emailEvents: EmailEventEntity[] }> {
    return {
      reports: await this.reportsService.listReports(id),
      emailEvents: await this.reportsService.listEmailEvents(id),
    };
  }
}
