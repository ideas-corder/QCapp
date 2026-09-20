import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from './data-source';
import { UserEntity } from './entities/user.entity';
import { CategoryEntity } from './entities/category.entity';
import { SupplierEntity } from './entities/supplier.entity';
// QcRuleEntity import removed 2026-09-03 — QC Rules feature retired.
// The qc_rules table is being dropped by migration
// 1700000025000-DropQcRulesAndTriggeredActions.
//
// FilterPresetEntity import removed 2026-09-03 — Filter Presets feature
// retired. The filter_presets table is being dropped by migration
// 1700000026000-DropFilterPresets.

dotenv.config();

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected. Seeding...');

  const userRepo = AppDataSource.getRepository(UserEntity);
  const categoryRepo = AppDataSource.getRepository(CategoryEntity);
  const supplierRepo = AppDataSource.getRepository(SupplierEntity);
  // ruleRepo removed 2026-09-03 — QC Rules feature retired.
  // presetRepo removed 2026-09-03 — Filter Presets feature retired.

  // Admin — promoted to super-admin so it can manage the Users master
  // and is the bootstrap-owner of the application. No other account
  // can edit / disable / delete this row.
  const adminEmail = 'admin@qc.local';
  let admin = await userRepo.findOne({ where: { email: adminEmail } });
  if (!admin) {
    admin = userRepo.create({
      email: adminEmail,
      passwordHash: await bcrypt.hash('Admin@123', 12),
      fullName: 'Default Admin',
      role: 'admin',
      isActive: true,
      isSuperAdmin: true,
    });
    await userRepo.save(admin);
    console.log(`Created admin (super-admin) user: ${adminEmail} / Admin@123`);
  } else {
    // Idempotent: if the row already exists (re-run of seed against an
    // existing DB), make sure it's flagged super-admin so /users works.
    if (!admin.isSuperAdmin) {
      admin.isSuperAdmin = true;
      await userRepo.save(admin);
      console.log(`Promoted existing admin to super-admin: ${adminEmail}`);
    }
  }

  // Demo inspector
  const inspectorEmail = 'inspector@qc.local';
  let inspector = await userRepo.findOne({ where: { email: inspectorEmail } });
  if (!inspector) {
    inspector = userRepo.create({
      email: inspectorEmail,
      passwordHash: await bcrypt.hash('Inspector@123', 12),
      fullName: 'Demo Inspector',
      role: 'inspector',
      isActive: true,
    });
    await userRepo.save(inspector);
    console.log(`Created inspector: ${inspectorEmail} / Inspector@123`);
  }

  // Categories & AQL setup — intentionally empty.
  // The Categories & AQL Setup Master starts empty so admins populate it
  // themselves (via "Add category" / "Import CSV" on the web UI). Seeding
  // demo categories here would clobber that clean state on every boot.
  const existingCategoryCount = await categoryRepo.count();
  if (existingCategoryCount > 0) {
    console.log(`Categories master already populated (${existingCategoryCount} rows) — leaving untouched.`);
  } else {
    console.log('Categories master is empty — nothing to seed. Admins can add categories from the web UI.');
  }

  // Suppliers
  const supplierSeeds = [
    {
      vendorId: 'VEN-005001',
      name: 'Acme Manufacturing',
      requireDoubleInspection: false,
      autoDebitNoteLimit: 500,
      notes: 'Long-term partner, consistent quality',
    },
    {
      vendorId: 'VEN-005002',
      name: 'Pacific Textiles Ltd.',
      requireDoubleInspection: false,
      autoDebitNoteLimit: 1000,
      notes: 'Occasional minor defects',
    },
    {
      vendorId: 'VEN-005003',
      name: 'Eastern Components Co.',
      requireDoubleInspection: true,
      autoDebitNoteLimit: 2500,
      notes: 'Requires double inspection on all lots',
    },
  ];
  for (const s of supplierSeeds) {
    let sup = await supplierRepo.findOne({ where: { name: s.name } });
    if (!sup) {
      sup = await supplierRepo.save(
        supplierRepo.create({
          vendorId: s.vendorId,
          name: s.name,
          requireDoubleInspection: s.requireDoubleInspection,
          autoDebitNoteLimit: String(s.autoDebitNoteLimit),
          notes: s.notes,
        }),
      );
      console.log(`Created supplier: ${s.name} (${s.vendorId})`);
    }
  }

  // QC Rules seeding removed 2026-09-03 — QC Rules feature retired.
  // The qc_rules table is being dropped by migration
  // 1700000025000-DropQcRulesAndTriggeredActions.

  // Filter Presets seeding removed 2026-09-03 — Filter Presets feature
  // retired. The 3 built-in presets (Critical Failures / Pending
  // Sync / Failed Last 7 Days) and the per-user custom preset
  // pipeline are gone. The filter_presets table is being dropped by
  // migration 1700000026000-DropFilterPresets.

  console.log('Seed complete.');
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
