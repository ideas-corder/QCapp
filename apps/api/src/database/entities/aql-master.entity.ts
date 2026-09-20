import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * AQL (Acceptable Quality Limit) sampling-plan master data.
 *
 * Each row is one lot-size bucket from the ANSI/ASQ Z1.4 single-sampling plan
 * (General Level II, AQL = 2.5 major).
 *
 * The row's identity is the lot-size range — the user-visible "Code" shown in
 * the UI is just `${minQty}-${maxQty}` (e.g. "2-8", "151-280"). The system
 * auto-derives it from min/max; the user never types it.
 *
 * Stored fields:
 *   - minQty         — lower end of the lot-size range (inclusive)
 *   - maxQty         — upper end of the lot-size range (inclusive)
 *   - sampleSize     — number of units to draw from the lot (UI: "Inspect Qty")
 *   - description    — admin-friendly note (optional)
 *   - isActive       — soft-delete / hide-from-pickers toggle
 *
 * Acceptance / Rejection counts (Pass/Re) are computed at runtime by
 * `calculateSampling()` in `common/aql.ts` from sample size + the chosen
 * AQL limit, so they are not stored on each master row.
 *
 * Note: this master is informational + editable. The runtime sampling engine
 * (`calculateSampling` in `common/aql.ts`) does its own math using the level
 * + lot size + AQL limits; the master here is the human-curated reference.
 */
@Entity({ name: 'aql_master' })
@Index('uq_aql_master_qty_range', ['minQty', 'maxQty'], { unique: true })
export class AqlMasterEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int', name: 'min_qty' })
  minQty!: number;

  @Column({ type: 'int', name: 'max_qty' })
  maxQty!: number;

  /** Number of units to inspect from the lot (UI label: "Inspect Qty"). */
  @Column({ type: 'int', name: 'sample_size' })
  sampleSize!: number;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
