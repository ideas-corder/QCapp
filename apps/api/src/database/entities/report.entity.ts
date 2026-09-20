import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Lifecycle of a generated report PDF.
 *
 * The `kind` field distinguishes reports produced automatically vs
 * ones triggered manually:
 *   - AUTO_SUBMIT      : archive snapshot taken right after a new
 *                        inspection is submitted (record / audit copy).
 *   - MANUAL_DOWNLOAD  : one-off PDF generated when an admin clicks
 *                        "Download detail report" on the detail page.
 *   - EMAIL_ATTACHMENT : PDF generated and attached to an outbound
 *                        email; we keep the file on disk so the email
 *                        event has a stable reference.
 *
 * Storage path is relative to `apps/api/storage/reports/` so the
 * directory can be backed up / pruned without touching DB rows.
 */
export type ReportKind = 'AUTO_SUBMIT' | 'MANUAL_DOWNLOAD' | 'EMAIL_ATTACHMENT';

@Entity({ name: 'reports' })
@Index('ix_reports_inspection', ['inspectionId'])
export class ReportEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'inspection_id' })
  inspectionId!: string;

  @Column({ type: 'varchar', length: 32, name: 'kind' })
  kind!: ReportKind;

  /**
   * SHA-256 hex digest of the PDF bytes. Useful for audit-trail
   * "did this PDF change?" comparisons; the file path may rotate
   * between environments but the hash is stable.
   */
  @Column({ type: 'varchar', length: 64, name: 'sha256', default: '' })
  sha256!: string;

  /** Bytes — surfaced in the audit trail so admins can sanity-check size. */
  @Column({ type: 'integer', name: 'byte_size', default: 0 })
  byteSize!: number;

  /** Relative path under the reports storage root, e.g. `<inspectionId>/<reportId>.pdf`. */
  @Column({ type: 'varchar', length: 512, name: 'storage_path' })
  storagePath!: string;

  /** Number of pages in the rendered PDF — useful for quick scanning. */
  @Column({ type: 'integer', name: 'page_count', default: 0 })
  pageCount!: number;

  /** The user who triggered the report (admin id) — null for auto-archive. */
  @Column({ type: 'uuid', nullable: true, name: 'generated_by' })
  generatedBy!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
