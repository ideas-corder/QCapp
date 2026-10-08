import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CategoryEntity } from './category.entity';
import { InspectorEntity } from './inspector.entity';
import { ProductCategoryEntity } from './product-category.entity';
import { SupplierEntity } from './supplier.entity';
import { UserEntity } from './user.entity';
import { DefectItemEntity } from './defect-item.entity';
import { PhotoEntity } from './photo.entity';
import { AqlMasterEntity } from './aql-master.entity';

export type InspectionResult =
  | 'PASS'
  | 'FAIL'
  | 'PENDING_REVIEW'
  | 'REWORK'
  | 'HOLD'
  | 'COMMERCIAL_APPROVED'
  | 'REJECTED';
export const INSPECTION_RESULT_VALUES: readonly InspectionResult[] = [
  'PASS',
  'FAIL',
  'PENDING_REVIEW',
  'REWORK',
  'HOLD',
  'COMMERCIAL_APPROVED',
  'REJECTED',
] as const;
export type SyncStatus = 'PENDING_SYNC' | 'SYNCED' | 'FAILED';
// Inspection types are now master-data driven (admin-defined codes such as
// INLINE, FINAL, DUPRO, PRE-SHIPMENT). Kept the type alias for any callers
// that still want the literal union as a hint.
export type InspectionType = string;

/**
 * One row in the `inspections.evaluation_checks` JSONB array. The form
 * keeps these in lockstep — when the inspector picks Yes for, say,
 * "Inline Inspection Done", the web form also uploads at least one
 * supporting photo through the existing /uploads/photo endpoint and tags
 * each uploaded photo with `kind = 'EVAL_INLINE_INSPECTION_DONE'`. We
 * snapshot the photo URLs on the row at submit time so the report /
 * detail view can show the photos even if the `photos` table is later
 * pruned by retention rules.
 */
export type EvaluationCheckKey =
  | 'INLINE_INSPECTION_DONE'
  | 'PP_SAMPLE_APPROVED'
  | 'IC_AVAILABLE'
  | 'BARCODE'
  | 'CARE_LABEL'
  | 'PACKING_LIST_AVAILABLE'
  | 'PO_SAME'
  | 'ATTACH_MEASUREMENT_SHEET'
  | 'STORAGE_OK'
  | 'TEST_REPORT_AVAILABLE';
export type EvaluationCheckAnswer = 'YES' | 'NO';
export interface EvaluationCheckRow {
  key: EvaluationCheckKey;
  label: string;
  answer: EvaluationCheckAnswer;
  photoCount: number;
  photoUrls: string[];
}

/**
 * Step 8 "Debit note" payload. The form keeps the comment empty until
 * the inspector picks "Yes", so a No answer can be persisted with a
 * blank comment without misrepresenting intent. Yes answers can also
 * carry zero or more supporting photo URLs (uploaded via the
 * `/uploads/photo` endpoint and tagged with kind='EVAL_DEBIT_NOTE' on
 * the `photos` table).
 */
export type DebitNoteAnswer = '' | 'YES' | 'NO';
export interface DebitNoteSnapshot {
  answer: DebitNoteAnswer;
  comment: string;
  photoCount: number;
  photoUrls: string[];
}

/**
 * Step 10 of the New Inspection form ("Signatures") captures e-signatures
 * from every stakeholder who has to authorise the lot — the QC
 * inspector, the supplier rep, the AQM, and the merchandiser. Each
 * stakeholder draws their signature on a dedicated canvas on the form;
 * the canvas serialises to a PNG data URL which the form forwards to
 * the API as the `dataUrl` field on a `SignatureSnapshot`.
 *
 * We persist all four signatures as a JSONB array on the inspection
 * row (column `signatures`) so the report and detail page can render
 * every signature in a single column read. The legacy
 * `signature_base64` text column (single Inspector signature) is kept
 * for backwards compatibility with rows created before the multi-signer
 * change — the report / detail page falls back to it when the new
 * `signatures` array is empty.
 */
export type SignatureRole =
  | 'QC_INSPECTOR'
  | 'SUPPLIER'
  | 'AQM'
  | 'MERCHANDISER';
export interface SignatureSnapshot {
  role: SignatureRole;
  label: string;
  dataUrl: string;
  signedAt: string; // ISO timestamp
}

@Entity({ name: 'inspections' })
@Index('ix_inspections_result', ['overallResult'])
@Index('ix_inspections_sync', ['syncStatus'])
@Index('ix_inspections_created', ['createdAt'])
export class InspectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Human-readable "Inspection Document Number" — printed on the PDF
   * report, shown in the grid, and used as the customer-facing reference.
   * Format: `QC-YYMMDD-NNNN` (per-day counter). Auto-assigned on
   * create by `InspectionsService.create()` if the client doesn't supply
   * one. Unique; backfilled for existing rows by migration
   * `AddInspectionNumber1700000022000`.
   */
  @Column({
    type: 'varchar',
    length: 32,
    unique: true,
    name: 'inspection_number',
  })
  inspectionNumber!: string;

  // Client-side idempotency key (FR-5.3 from original spec)
  @Column({ type: 'uuid', unique: true, name: 'submission_uuid' })
  submissionUuid!: string;

  // Legacy AQL-bearing categories master — wiped from the system by the
  // operator, so this FK is now optional. We keep the column + relation
  // for backward compatibility with older rows that did pick a category,
  // but new rows may leave `categoryId` NULL. The relation uses
  // `nullable: true` so TypeORM doesn't try to JOIN a row that isn't
  // there when eager-loading for the report PDF.
  @ManyToOne(() => CategoryEntity, { onDelete: 'RESTRICT', eager: true, nullable: true })
  @JoinColumn({ name: 'category_id' })
  category!: CategoryEntity | null;

  @Column({ type: 'uuid', name: 'category_id', nullable: true })
  categoryId!: string | null;

  // New "what kind of product" master (independent of the legacy
  // AQL-bearing categories table). Nullable so existing rows are not
  // forced to backfill immediately.
  @ManyToOne(() => ProductCategoryEntity, {
    onDelete: 'SET NULL',
    eager: true,
    nullable: true,
  })
  @JoinColumn({ name: 'product_category_id' })
  productCategory!: ProductCategoryEntity | null;

  @Column({ type: 'uuid', nullable: true, name: 'product_category_id' })
  productCategoryId!: string | null;

  @ManyToOne(() => SupplierEntity, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier!: SupplierEntity;

  @Column({ type: 'uuid', name: 'supplier_id' })
  supplierId!: string;

  @Column({ type: 'boolean', default: false, name: 'is_custom_supplier' })
  isCustomSupplier!: boolean;

  @Column({ type: 'varchar', length: 255, default: '', name: 'custom_supplier_name' })
  customSupplierName!: string;

  @Column({ type: 'varchar', length: 128, default: '', name: 'po_number' })
  poNumber!: string;

  @Column({ type: 'varchar', length: 128, default: '', name: 'item_number' })
  itemNumber!: string;

  @Column({ type: 'text', default: '', name: 'item_description' })
  itemDescription!: string;

  @Column({ type: 'varchar', length: 128, default: '', name: 'color' })
  color!: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: 'FINAL',
    name: 'inspection_type',
  })
  inspectionType!: InspectionType;

  // Reference to the AQL master row that drives this inspection's sampling
  // plan. Replaces the legacy per-inspection lot_size / inspection_level /
  // aql_limit_* columns.
  @ManyToOne(() => AqlMasterEntity, {
    onDelete: 'RESTRICT',
    eager: true,
    nullable: false,
  })
  @JoinColumn({ name: 'aql_master_id' })
  aqlMaster!: AqlMasterEntity;

  @Column({ type: 'uuid', name: 'aql_master_id' })
  aqlMasterId!: string;

  @Column({ type: 'integer', name: 'sample_size' })
  sampleSize!: number;

  @Column({ type: 'varchar', length: 4, default: '', name: 'code_letter' })
  codeLetter!: string;

  @Column({ type: 'integer', default: 0, name: 'critical_ac' })
  criticalAc!: number;

  @Column({ type: 'integer', default: 1, name: 'critical_re' })
  criticalRe!: number;

  @Column({ type: 'integer', default: 0, name: 'major_ac' })
  majorAc!: number;

  @Column({ type: 'integer', default: 1, name: 'major_re' })
  majorRe!: number;

  @Column({ type: 'integer', default: 0, name: 'minor_ac' })
  minorAc!: number;

  @Column({ type: 'integer', default: 1, name: 'minor_re' })
  minorRe!: number;

  @Column({ type: 'integer', default: 0, name: 'total_critical' })
  totalCritical!: number;

  @Column({ type: 'integer', default: 0, name: 'total_major' })
  totalMajor!: number;

  @Column({ type: 'integer', default: 0, name: 'total_minor' })
  totalMinor!: number;

  @Column({ type: 'varchar', length: 32, default: 'PENDING_REVIEW', name: 'overall_result' })
  overallResult!: InspectionResult;

  @Column({ type: 'varchar', length: 255, default: '', name: 'inspector_name' })
  inspectorName!: string;

  @Column({ type: 'text', default: '', name: 'inspector_notes' })
  inspectorNotes!: string;

  // Signature is stored as base64; FR-4.5 says raw bytes on local storage.
  // For server-side, base64 keeps the column simple.
  // This column carries the LEGACY single-Inspector signature for rows
  // written before the multi-signer change. New rows use the `signatures`
  // JSONB array below; the report / detail page falls back to this
  // column only when `signatures` is empty.
  @Column({ type: 'text', default: '', name: 'signature_base64' })
  signatureBase64!: string;

  /**
   * Multi-signer signatures captured on Step 10 of the New Inspection
   * form. Each entry is a self-contained snapshot of the role, the
   * display label, the PNG data URL produced by the canvas, and the
   * ISO timestamp at the moment the user released the pointer. The
   * form always sends all four roles; the API normalises the array
   * (drops empty data URLs) before persisting.
   */
  @Column({ type: 'jsonb', default: () => "'[]'", name: 'signatures' })
  signatures!: SignatureSnapshot[];

  @Column({ type: 'varchar', length: 32, default: 'PENDING_SYNC', name: 'sync_status' })
  syncStatus!: SyncStatus;

  /**
   * Step 6 "Evaluation checks" — fixed set of yes/no readiness questions
   * (Inline Inspection Done, PP Sample Approved, IC Available, Barcode,
   * Care Label). Each Yes answer can carry zero or more supporting photos
   * via the `photos` relation (kind='EVAL_*'). Stored as a JSONB array so
   * admins can add/rename checks later without a migration.
   */
  @Column({ type: 'jsonb', default: () => "'[]'", name: 'evaluation_checks' })
  evaluationChecks!: EvaluationCheckRow[];

  /**
   * Step 8 "Debit note" — inspector raises a debit note against the
   * supplier when the lot has a quality / commercial issue. `answer`
   * carries the yes/no choice; `comment` is required when the answer is
   * Yes and explains the reason. We persist the snapshot at submit time
   * so the report and detail page can show the debit-note decision
   * without re-querying a separate table.
   */
  @Column({ type: 'jsonb', default: () => "'{}'", name: 'debit_note' })
  debitNote!: DebitNoteSnapshot;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true, eager: true })
  @JoinColumn({ name: 'inspector_id' })
  inspector!: UserEntity | null;

  @Column({ type: 'uuid', nullable: true, name: 'inspector_id' })
  inspectorId!: string | null;

  // The dedicated Inspector master — distinct from the user login link
  // above. Drives the dropdown on the new-inspection form.
  @ManyToOne(() => InspectorEntity, {
    onDelete: 'SET NULL',
    eager: true,
    nullable: true,
  })
  @JoinColumn({ name: 'inspector_master_id' })
  inspectorMaster!: InspectorEntity | null;

  @Column({ type: 'uuid', nullable: true, name: 'inspector_master_id' })
  inspectorMasterId!: string | null;

  @OneToMany(() => DefectItemEntity, (d) => d.inspection, { cascade: true })
  defects!: DefectItemEntity[];

  @OneToMany(() => PhotoEntity, (p) => p.inspection, { cascade: true })
  photos!: PhotoEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'date', nullable: true, name: 'inspection_date' })
  inspectionDate!: string | null;

  @Column({ type: 'date', nullable: true, name: 'delivery_date' })
  deliveryDate!: string | null;

  @Column({ type: 'varchar', length: 255, default: '', name: 'merchandiser_name' })
  merchandiserName!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, name: 'order_quantity' })
  orderQuantity!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, name: 'presented_quantity' })
  presentedQuantity!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, name: 'inspected_quantity' })
  inspectedQuantity!: string;

  // Carton-level counters — distinct from the per-unit quantities above.
  // `total_cartons` is the lot's carton count, `inspected_cartons` is how
  // many cartons were actually opened / inspected. Integer-only (no decimals).
  @Column({ type: 'integer', default: 0, name: 'total_cartons' })
  totalCartons!: number;

  @Column({ type: 'integer', default: 0, name: 'inspected_cartons' })
  inspectedCartons!: number;

  @Column({ type: 'varchar', length: 255, default: '', name: 'fabric_quality' })
  fabricQuality!: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
