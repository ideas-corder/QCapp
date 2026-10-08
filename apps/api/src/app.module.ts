import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductCategoriesModule } from './product-categories/product-categories.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { InspectorsModule } from './inspectors/inspectors.module';
import { MerchandisersModule } from './merchandisers/merchandisers.module';
// RulesModule was removed on 2026-09-03 — QC Rules feature retired.
// The module file remains as an empty stub so any stale reference still
// resolves, but it is no longer registered in AppModule (see comment
// below). To restore, re-introduce the import + add `RulesModule` to
// the imports[] array.
//
// FilterPresetsModule was removed on 2026-09-03 — Filter Presets
// feature retired. Same pattern as RulesModule: the file remains as
// an empty stub so any stale reference still resolves, but the
// module is no longer registered in AppModule. To restore,
// re-introduce the import + add `FilterPresetsModule` to the
// imports[] array.
import { InspectionViewsModule } from './inspection-views/inspection-views.module';
import { InspectionsModule } from './inspections/inspections.module';
import { InspectionTypesModule } from './inspection-types/inspection-types.module';
import { UploadsModule } from './uploads/uploads.module';
import { ReportsModule } from './reports/reports.module';
import { AqlMasterModule } from './aql-master/aql-master.module';
import { entities } from './database/entities';
import { MastersSeedService } from './database/masters-seed.service';
import {
  InspectionTypeEntity,
  InspectionViewEntity,
  InspectorEntity,
  ProductCategoryEntity,
  SupplierEntity,
} from './database/entities';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Register the four master repositories at the app level so
    // MastersSeedService (lifecycle hook) can use them before any
    // feature module's controller fires its first request.
    TypeOrmModule.forFeature([
      InspectionTypeEntity,
      InspectionViewEntity,
      InspectorEntity,
      ProductCategoryEntity,
      SupplierEntity,
    ]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      username: process.env.DB_USERNAME || 'qc',
      password: process.env.DB_PASSWORD || 'qc_password_change_me',
      database: process.env.DB_DATABASE || 'qc_inspector',
      entities: entities as any,
      synchronize: false,
      logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : false,
      autoLoadEntities: false,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), process.env.UPLOAD_DIR || './uploads'),
      serveRoot: '/uploads',
    }),
    UsersModule,
    AuthModule,
    CategoriesModule,
    ProductCategoriesModule,
    SuppliersModule,
    InspectorsModule,
    MerchandisersModule,
    // RulesModule intentionally not registered — QC Rules retired 2026-09-03.
    // FilterPresetsModule intentionally not registered — Filter Presets retired 2026-09-03.
    InspectionViewsModule,
    InspectionsModule,
    InspectionTypesModule,
    UploadsModule,
    ReportsModule,
    AqlMasterModule,
  ],
  providers: [MastersSeedService],
})
export class AppModule {}
