import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';
import { InspectionEntity } from '../database/entities/inspection.entity';
import { DefectItemEntity } from '../database/entities/defect-item.entity';
import { PhotoEntity } from '../database/entities/photo.entity';
import { InspectionTypeEntity } from '../database/entities/inspection-type.entity';
import { InspectorEntity } from '../database/entities/inspector.entity';
import { ProductCategoryEntity } from '../database/entities/product-category.entity';
import { MerchandiserEntity } from '../database/entities/merchandiser.entity';
import { CategoryMerchandiser } from '../database/entities/category-merchandiser.entity';
import { AqlMasterEntity } from '../database/entities/aql-master.entity';
// RulesModule was removed on 2026-09-03 — QC Rules feature retired.
// InspectionsService no longer injects RulesEngine and no longer calls
// rulesEngine.evaluate() in create(). The module file remains as an
// empty stub so any stale reference still resolves.
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InspectionEntity,
      DefectItemEntity,
      PhotoEntity,
      InspectionTypeEntity,
      ProductCategoryEntity,
      MerchandiserEntity,
      CategoryMerchandiser,
      InspectorEntity,
      AqlMasterEntity,
    ]),
    // RulesModule intentionally not registered — QC Rules retired 2026-09-03.
    // forwardRef — ReportsModule imports InspectionsModule to read
    // inspections; we need to inject ReportsService back into
    // InspectionsService for the auto-archive-on-submit hook.
    forwardRef(() => ReportsModule),
  ],
  controllers: [InspectionsController],
  providers: [InspectionsService],
  exports: [InspectionsService],
})
export class InspectionsModule {}
