import { AqlMasterEntity } from './aql-master.entity';
import { CategoryAqlSetupEntity } from './category-aql.entity';
import { CategoryEntity } from './category.entity';
import { DefectItemEntity } from './defect-item.entity';
import { EmailEventEntity } from './email-event.entity';
// FilterPresetEntity was removed from the registry on 2026-09-03 —
// Filter Presets feature retired. The entity file remains as an empty
// stub so any stale import resolves, but it's no longer registered
// with TypeORM (which means the filter_presets table will not be
// touched by ORM code). The table itself is being dropped by
// migration 1700000026000-DropFilterPresets.
import { InspectionEntity } from './inspection.entity';
import { InspectionTypeEntity } from './inspection-type.entity';
import { InspectionViewEntity } from './inspection-view.entity';
import { InspectorEntity } from './inspector.entity';
import { MerchandiserEntity } from './merchandiser.entity';
import { PhotoEntity } from './photo.entity';
import { ProductCategoryEntity } from './product-category.entity';
// QcRuleEntity was removed from the registry on 2026-09-03 — QC Rules
// feature retired. The entity file remains as an empty stub so any
// stale import resolves, but it's no longer registered with TypeORM
// (which means the qc_rules table will not be touched by ORM code).
// The table itself is being dropped by migration
// 1700000025000-DropQcRulesAndTriggeredActions.
import { ReportEntity } from './report.entity';
import { SupplierEntity } from './supplier.entity';
import { UserEntity } from './user.entity';

export const entities = [
  UserEntity,
  CategoryEntity,
  CategoryAqlSetupEntity,
  ProductCategoryEntity,
  SupplierEntity,
  InspectorEntity,
  MerchandiserEntity,
  // QcRuleEntity intentionally not registered — removed 2026-09-03.
  // FilterPresetEntity intentionally not registered — removed 2026-09-03.
  InspectionEntity,
  InspectionTypeEntity,
  InspectionViewEntity,
  DefectItemEntity,
  PhotoEntity,
  AqlMasterEntity,
  ReportEntity,
  EmailEventEntity,
] as const;

export {
  AqlMasterEntity,
  EmailEventEntity,
  ReportEntity,
  UserEntity,
  CategoryEntity,
  CategoryAqlSetupEntity,
  ProductCategoryEntity,
  SupplierEntity,
  InspectorEntity,
  MerchandiserEntity,
  // QcRuleEntity intentionally not re-exported — removed 2026-09-03.
  // FilterPresetEntity intentionally not re-exported — removed 2026-09-03.
  InspectionEntity,
  InspectionTypeEntity,
  InspectionViewEntity,
  DefectItemEntity,
  PhotoEntity,
};
