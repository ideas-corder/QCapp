import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InspectionTypeEntity } from './entities/inspection-type.entity';
import { InspectionViewEntity } from './entities/inspection-view.entity';
import { InspectorEntity } from './entities/inspector.entity';
import { ProductCategoryEntity } from './entities/product-category.entity';
import { SupplierEntity } from './entities/supplier.entity';

/**
 * One-time bootstrap seeder for the four masters required by the New
 * Inspection form (product-categories, suppliers, inspectors,
 * inspection-types).
 *
 * Runs once on API module init. For each master it checks whether an
 * active row exists; if not, it inserts a sensible default. If inactive
 * rows with the same unique code/vendorId already exist (e.g. the admin
 * previously deactivated the seed and then deleted everything else), it
 * reactivates the existing row instead of inserting a duplicate, so the
 * unique constraints never fire and the user's data is preserved.
 *
 * Categories (`categories` / AQL setup) is intentionally NOT seeded —
 * that master is admin-curated and starts empty by design (see
 * `database/seed.ts`).
 *
 * This is what makes the "Setup required" banner in
 * `apps/web/src/app/inspections/new/page.tsx` effectively dead code:
 * every required master is guaranteed to have at least one active row
 * on a fresh DB. The banner still exists as a defensive fallback for
 * truly pathological states (e.g. an admin manually DELETEs every row
 * in a master via direct SQL), which is intentional.
 */
@Injectable()
export class MastersSeedService implements OnModuleInit {
  private readonly logger = new Logger(MastersSeedService.name);

  constructor(
    @InjectRepository(InspectionTypeEntity)
    private readonly inspectionTypeRepo: Repository<InspectionTypeEntity>,
    @InjectRepository(InspectionViewEntity)
    private readonly inspectionViewRepo: Repository<InspectionViewEntity>,
    @InjectRepository(InspectorEntity)
    private readonly inspectorRepo: Repository<InspectorEntity>,
    @InjectRepository(ProductCategoryEntity)
    private readonly productCategoryRepo: Repository<ProductCategoryEntity>,
    @InjectRepository(SupplierEntity)
    private readonly supplierRepo: Repository<SupplierEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await Promise.all([
        this.ensureInspectionType(),
        this.ensureInspector(),
        this.ensureProductCategory(),
        this.ensureSupplier(),
        this.ensureDefaultView(),
      ]);
      this.logger.log('Required masters checked — at least one active row in each.');
    } catch (err) {
      // Don't crash the API on a seed failure — log it loudly and let
      // the in-page banner handle the user-facing recovery path.
      this.logger.error(
        'Failed to ensure required masters on boot',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // ---- inspection-types ----
  private async ensureInspectionType(): Promise<void> {
    const code = 'FINAL';
    const have = await this.inspectionTypeRepo.count({ where: { isActive: true } });
    if (have > 0) return;
    const existing = await this.inspectionTypeRepo.findOne({ where: { code } });
    if (existing) {
      existing.isActive = true;
      existing.label = existing.label || 'Final inspection';
      await this.inspectionTypeRepo.save(existing);
      this.logger.log(`Reactivated existing inspection_type ${code}.`);
      return;
    }
    await this.inspectionTypeRepo.save(
      this.inspectionTypeRepo.create({
        code,
        label: 'Final inspection',
        description: 'Auto-created default — edit / extend in Inspection Types.',
        isActive: true,
      }),
    );
    this.logger.log(`Seeded inspection_type ${code}.`);
  }

  // ---- inspectors ----
  private async ensureInspector(): Promise<void> {
    const code = 'INSP-001';
    const have = await this.inspectorRepo.count({ where: { isActive: true } });
    if (have > 0) return;
    const existing = await this.inspectorRepo.findOne({ where: { code } });
    if (existing) {
      existing.isActive = true;
      existing.name = existing.name || 'Default inspector';
      await this.inspectorRepo.save(existing);
      this.logger.log(`Reactivated existing inspector ${code}.`);
      return;
    }
    await this.inspectorRepo.save(
      this.inspectorRepo.create({
        code,
        name: 'Default inspector',
        notes: 'Auto-created default — edit / extend in Inspectors.',
        isActive: true,
      }),
    );
    this.logger.log(`Seeded inspector ${code}.`);
  }

  // ---- product-categories ----
  private async ensureProductCategory(): Promise<void> {
    const code = 'GENERAL';
    const have = await this.productCategoryRepo.count({ where: { isActive: true } });
    if (have > 0) return;
    const existing = await this.productCategoryRepo.findOne({ where: { code } });
    if (existing) {
      existing.isActive = true;
      existing.name = existing.name || 'General products';
      await this.productCategoryRepo.save(existing);
      this.logger.log(`Reactivated existing product_category ${code}.`);
      return;
    }
    await this.productCategoryRepo.save(
      this.productCategoryRepo.create({
        code,
        name: 'General products',
        description: 'Auto-created default — edit / extend in Product Categories.',
        isActive: true,
      }),
    );
    this.logger.log(`Seeded product_category ${code}.`);
  }

  // ---- suppliers ----
  private async ensureSupplier(): Promise<void> {
    const vendorId = 'VEN-000001';
    const have = await this.supplierRepo.count();
    if (have > 0) return;
    const existing = await this.supplierRepo.findOne({ where: { vendorId } });
    if (existing) {
      existing.name = existing.name || 'Default supplier';
      await this.supplierRepo.save(existing);
      this.logger.log(`Reactivated existing supplier ${vendorId}.`);
      return;
    }
    await this.supplierRepo.save(
      this.supplierRepo.create({
        vendorId,
        name: 'Default supplier',
        notes: 'Auto-created default — edit / extend in Suppliers.',
      }),
    );
    this.logger.log(`Seeded supplier ${vendorId}.`);
  }

  // ---- inspection_views ----
  /**
   * Always ensure the system "Default" view exists so the front-end
   * has something to fall back to when a user has zero saved views.
   * Empty layout = "show every column in default order".
   */
  private async ensureDefaultView(): Promise<void> {
    const exists = await this.inspectionViewRepo.findOne({
      where: { name: 'Default', isBuiltIn: true },
    });
    if (exists) return;
    await this.inspectionViewRepo.save(
      this.inspectionViewRepo.create({
        name: 'Default',
        description: 'Show every column in default order',
        isBuiltIn: true,
        ownerId: null,
        layout: {},
      }),
    );
    this.logger.log('Seeded inspection_view "Default".');
  }
}