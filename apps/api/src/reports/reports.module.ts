import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InspectionsModule } from '../inspections/inspections.module';
import { EmailEventEntity } from '../database/entities/email-event.entity';
import { ReportEntity } from '../database/entities/report.entity';
import { DetailReportBuilder } from './detail-report.builder';
import { EmailService } from './email.service';
import { ReportStorageService } from './report-storage.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReportEntity, EmailEventEntity]),
    // forwardRef — InspectionsService injects ReportsService back to
    // do the auto-archive-on-submit hook.
    forwardRef(() => InspectionsModule),
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportStorageService,
    DetailReportBuilder,
    EmailService,
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
