import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar(255) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "full_name" varchar(255) NOT NULL,
        "role" varchar(32) NOT NULL DEFAULT 'inspector',
        "is_active" boolean NOT NULL DEFAULT true,
        "mfa_secret" varchar(64),
        "mfa_enabled" boolean NOT NULL DEFAULT false,
        "last_login_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_categories" PRIMARY KEY ("id"),
        CONSTRAINT "uq_categories_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "category_aql_setups" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "category_id" uuid NOT NULL,
        "default_aql_major" numeric(4,2) NOT NULL,
        "default_aql_minor" numeric(4,2) NOT NULL,
        "inspection_level" varchar(32) NOT NULL,
        "auto_fail_on_critical" boolean NOT NULL DEFAULT true,
        "strict_mode" boolean NOT NULL DEFAULT false,
        "max_allowed_defects" integer NOT NULL DEFAULT 10,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_category_aql_setups" PRIMARY KEY ("id"),
        CONSTRAINT "fk_category_aql_category" FOREIGN KEY ("category_id")
          REFERENCES "categories"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "suppliers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "risk_tier" varchar(32) NOT NULL DEFAULT 'MEDIUM',
        "quality_score" integer NOT NULL DEFAULT 75,
        "require_double_inspection" boolean NOT NULL DEFAULT false,
        "auto_debit_note_limit" numeric(12,2) NOT NULL DEFAULT 0,
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_suppliers" PRIMARY KEY ("id"),
        CONSTRAINT "uq_suppliers_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "qc_rules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" varchar(255) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "category_target" varchar(255) NOT NULL DEFAULT 'ALL',
        "condition_type" varchar(64) NOT NULL,
        "threshold_value" numeric(12,2) NOT NULL,
        "action" varchar(64) NOT NULL,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_qc_rules" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_qc_rules_enabled" ON "qc_rules" ("is_enabled")`,
    );

    await queryRunner.query(`
      CREATE TABLE "filter_presets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "description" text NOT NULL DEFAULT '',
        "criteria" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "is_built_in" boolean NOT NULL DEFAULT false,
        "owner_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_filter_presets" PRIMARY KEY ("id"),
        CONSTRAINT "fk_filter_presets_owner" FOREIGN KEY ("owner_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "inspections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "submission_uuid" uuid NOT NULL,
        "debit_note" varchar(255) NOT NULL DEFAULT '',
        "category_id" uuid NOT NULL,
        "supplier_id" uuid NOT NULL,
        "is_custom_supplier" boolean NOT NULL DEFAULT false,
        "custom_supplier_name" varchar(255) NOT NULL DEFAULT '',
        "po_number" varchar(128) NOT NULL DEFAULT '',
        "item_number" varchar(128) NOT NULL DEFAULT '',
        "item_description" text NOT NULL DEFAULT '',
        "lot_size" integer NOT NULL,
        "inspection_level" varchar(32) NOT NULL,
        "aql_limit_major" numeric(4,2) NOT NULL,
        "aql_limit_minor" numeric(4,2) NOT NULL,
        "sample_size" integer NOT NULL,
        "code_letter" varchar(4) NOT NULL DEFAULT '',
        "critical_ac" integer NOT NULL DEFAULT 0,
        "critical_re" integer NOT NULL DEFAULT 1,
        "major_ac" integer NOT NULL DEFAULT 0,
        "major_re" integer NOT NULL DEFAULT 1,
        "minor_ac" integer NOT NULL DEFAULT 0,
        "minor_re" integer NOT NULL DEFAULT 1,
        "total_critical" integer NOT NULL DEFAULT 0,
        "total_major" integer NOT NULL DEFAULT 0,
        "total_minor" integer NOT NULL DEFAULT 0,
        "overall_result" varchar(32) NOT NULL DEFAULT 'PENDING_REVIEW',
        "inspector_name" varchar(255) NOT NULL DEFAULT '',
        "inspector_notes" text NOT NULL DEFAULT '',
        "signature_base64" text NOT NULL DEFAULT '',
        "sync_status" varchar(32) NOT NULL DEFAULT 'PENDING_SYNC',
        "triggered_actions" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "inspector_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_inspections" PRIMARY KEY ("id"),
        CONSTRAINT "uq_inspections_submission_uuid" UNIQUE ("submission_uuid"),
        CONSTRAINT "fk_inspections_category" FOREIGN KEY ("category_id")
          REFERENCES "categories"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_inspections_supplier" FOREIGN KEY ("supplier_id")
          REFERENCES "suppliers"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_inspections_inspector" FOREIGN KEY ("inspector_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_inspections_result" ON "inspections" ("overall_result")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_inspections_sync" ON "inspections" ("sync_status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_inspections_created" ON "inspections" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_inspections_category" ON "inspections" ("category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_inspections_supplier" ON "inspections" ("supplier_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "defect_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "inspection_id" uuid NOT NULL,
        "severity" varchar(32) NOT NULL,
        "description" varchar(255) NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "remarks" text NOT NULL DEFAULT '',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_defect_items" PRIMARY KEY ("id"),
        CONSTRAINT "fk_defect_inspection" FOREIGN KEY ("inspection_id")
          REFERENCES "inspections"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_defect_items_inspection" ON "defect_items" ("inspection_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "photos" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "inspection_id" uuid NOT NULL,
        "url" varchar(512) NOT NULL,
        "thumbnail_url" varchar(512),
        "mime_type" varchar(64),
        "size" integer,
        "width" integer,
        "height" integer,
        "caption" varchar(64) NOT NULL DEFAULT '',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_photos" PRIMARY KEY ("id"),
        CONSTRAINT "fk_photos_inspection" FOREIGN KEY ("inspection_id")
          REFERENCES "inspections"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_photos_inspection" ON "photos" ("inspection_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "photos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "defect_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inspections"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "filter_presets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "qc_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "suppliers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "category_aql_setups"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "categories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
