import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import * as path from 'path';
import {
  CategoryAqlSetupEntity,
  CategoryEntity,
  CategoryMerchandiser,
  DefectItemEntity,
  // FilterPresetEntity removed 2026-09-03 — Filter Presets feature retired.
  InspectionEntity,
  InspectionTypeEntity,
  InspectionViewEntity,
  InspectorEntity,
  MerchandiserEntity,
  PhotoEntity,
  ProductCategoryEntity,
  // QcRuleEntity removed 2026-09-03 — QC Rules feature retired.
  SupplierEntity,
  UserEntity,
  AqlMasterEntity,
} from './entities';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME || 'qc',
  password: process.env.DB_PASSWORD || 'qc_password_change_me',
  database: process.env.DB_DATABASE || 'qc_inspector',
  entities: [
    UserEntity,
    CategoryEntity,
    CategoryAqlSetupEntity,
    CategoryMerchandiser,
    ProductCategoryEntity,
    SupplierEntity,
    InspectorEntity,
    MerchandiserEntity,
    // QcRuleEntity removed 2026-09-03 — QC Rules feature retired.
    // FilterPresetEntity removed 2026-09-03 — Filter Presets feature retired.
    InspectionEntity,
    InspectionTypeEntity,
    InspectionViewEntity,
    DefectItemEntity,
    PhotoEntity,
    AqlMasterEntity,
  ],
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});
