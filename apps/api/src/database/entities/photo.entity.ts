import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InspectionEntity } from './inspection.entity';

/**
 * Allowed photo kinds. The default 'INSPECTION' covers the legacy per-unit
 * inspection photos; the two carton-level kinds are emitted by the
 * New Inspection form Step 7; the nine 'EVAL_*' kinds are emitted by the
 * new Step 6 "Evaluation checks" card when an inspector answers Yes to a
 * readiness question; the two `DEFECT_*` kinds are emitted by the Step 8
 * "Defects captured" card — every defect entry the inspector adds requires
 * at least one supporting photo, and the photo is tagged with the defect's
 * severity (MAJOR / MINOR) for downstream grouping on the PDF report.
 * The column is varchar(32) so the DB accepts any of these values without
 * a migration; the TS union just enforces it at compile time and on the
 * API validator.
 */
export type PhotoKind =
  | 'INSPECTION'
  | 'CARTON_UPLOAD'
  | 'CARTON_INSPECT'
  | 'EVAL_INLINE_INSPECTION_DONE'
  | 'EVAL_PP_SAMPLE_APPROVED'
  | 'EVAL_IC_AVAILABLE'
  | 'EVAL_BARCODE'
  | 'EVAL_CARE_LABEL'
  | 'EVAL_PACKING_LIST_AVAILABLE'
  | 'EVAL_PO_SAME'
  | 'EVAL_ATTACH_MEASUREMENT_SHEET'
  | 'EVAL_STORAGE_OK'
  | 'EVAL_TEST_REPORT_AVAILABLE'
  | 'EVAL_DEBIT_NOTE'
  | 'DEFECT_MAJOR'
  | 'DEFECT_MINOR';

/**
 * Severity the photo documents. Only set on the two `DEFECT_*`
 * photo kinds; NULL for all the others.
 */
export type PhotoSeverity = 'MAJOR' | 'MINOR';

@Entity({ name: 'photos' })
@Index('ix_photos_defect', ['defectId'])
export class PhotoEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => InspectionEntity, (i) => i.photos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inspection_id' })
  inspection!: InspectionEntity;

  @Column({ type: 'uuid', name: 'inspection_id' })
  inspectionId!: string;

  @Column({ type: 'varchar', length: 512 })
  url!: string;

  @Column({ type: 'varchar', length: 512, name: 'thumbnail_url', nullable: true })
  thumbnailUrl!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'mime_type' })
  mimeType!: string | null;

  @Column({ type: 'integer', nullable: true })
  size!: number | null;

  @Column({ type: 'integer', nullable: true })
  width!: number | null;

  @Column({ type: 'integer', nullable: true })
  height!: number | null;

  @Column({ type: 'varchar', length: 64, default: '' })
  caption!: string;

  /**
   * Photo purpose: 'INSPECTION' (legacy default), 'CARTON_UPLOAD'
   * (cartons as they arrived — Step 7), 'CARTON_INSPECT' (cartons
   * during inspection — Step 7), 'EVAL_*' (Step 6 evaluation
   * checks + Step 8 debit note), or 'DEFECT_MAJOR' / 'DEFECT_MINOR'
   * (Step 8 per-defect photo evidence).
   */
  @Column({ type: 'varchar', length: 32, default: 'INSPECTION' })
  kind!: PhotoKind;

  /**
   * Severity the photo documents. Only set on `DEFECT_MAJOR` /
   * `DEFECT_MINOR` photo kinds — NULL everywhere else. Read on the
   * PDF report to group defect photos by severity so the reader can
   * see the Major evidence and the Minor evidence side by side.
   */
  @Column({ type: 'varchar', length: 16, nullable: true })
  severity!: PhotoSeverity | null;

  /**
   * Optional FK to the specific defect row this photo documents.
   * Only set on `DEFECT_*` photo kinds — NULL for everything else,
   * and also NULL for any legacy defect photo uploaded before this
   * column existed. Indexed via `ix_photos_defect` so per-defect
   * photo queries stay fast.
   */
  @Column({ type: 'uuid', nullable: true, name: 'defect_id' })
  defectId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
