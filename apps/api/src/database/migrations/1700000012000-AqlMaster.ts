import { MigrationInterface, QueryRunner } from 'typeorm';

export class AqlMaster1700000012000 implements MigrationInterface {
  name = 'AqlMaster1700000012000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Master table for AQL sampling-plan buckets.
    await queryRunner.query(`
      CREATE TABLE "aql_master" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code_letter" varchar(2) NOT NULL,
        "min_qty" integer NOT NULL,
        "max_qty" integer NOT NULL,
        "sample_size" integer NOT NULL,
        "major_ac" integer NOT NULL,
        "major_re" integer NOT NULL,
        "minor_ac" integer NOT NULL,
        "minor_re" integer NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_aql_master" PRIMARY KEY ("id"),
        CONSTRAINT "uq_aql_master_code_letter" UNIQUE ("code_letter")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_aql_master_active" ON "aql_master" ("is_active")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_aql_master_qty_range" ON "aql_master" ("min_qty", "max_qty")`,
    );

    // 2. Seed the standard ANSI/ASQ Z1.4 single-sampling plan at
    //    General Level II, AQL = 2.5 (Major) / 4.0 (Minor).
    //    Source: ANSI/ASQ Z1.4-2003 (R2018), Table II-A.
    await queryRunner.query(
      `INSERT INTO "aql_master"
        ("code_letter","min_qty","max_qty","sample_size","major_ac","major_re","minor_ac","minor_re","description","is_active")
       VALUES
         ('A',2,8,2,0,1,0,1,'Lot size 2–8',                  true),
         ('B',9,15,3,0,1,0,1,'Lot size 9–15',                true),
         ('C',16,25,5,0,1,0,1,'Lot size 16–25',               true),
         ('D',26,50,8,0,1,1,2,'Lot size 26–50',               true),
         ('E',51,90,13,1,2,2,3,'Lot size 51–90',              true),
         ('F',91,150,20,1,2,3,4,'Lot size 91–150',            true),
         ('G',151,280,32,2,3,5,6,'Lot size 151–280',          true),
         ('H',281,500,50,3,4,7,8,'Lot size 281–500',           true),
         ('J',501,1200,80,5,6,10,11,'Lot size 501–1,200',      true),
         ('K',1201,3200,125,7,8,14,15,'Lot size 1,201–3,200',  true),
         ('L',3201,10000,200,10,11,21,22,'Lot size 3,201–10,000', true),
         ('M',10001,35000,315,14,15,21,22,'Lot size 10,001–35,000', true),
         ('N',35001,150000,500,21,22,21,22,'Lot size 35,001–150,000', true)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_aql_master_qty_range"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_aql_master_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "aql_master"`);
  }
}
