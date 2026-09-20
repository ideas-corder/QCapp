import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Audit-trail record for every "email detail report" action.
 *
 * `status` follows the same lifecycle as a transactional email:
 *   - QUEUED : accepted by the email service, awaiting relay.
 *   - SENT   : successfully handed off to the SMTP transport (or, in
 *              dev / mock mode, written to the .eml drop directory).
 *   - FAILED : transport rejected the message — see `errorMessage`.
 *
 * `recipients` and `cc` are JSONB arrays so we don't need a join
 * table for what is effectively an immutable snapshot of who got the
 * report at the time it was sent. Each entry is
 * `{ name?: string, email: string, role: 'TO' | 'CC' | 'BCC' }`.
 */
export type EmailEventStatus = 'QUEUED' | 'SENT' | 'FAILED';

export type EmailRecipientRole = 'TO' | 'CC' | 'BCC';

export interface EmailRecipient {
  name?: string;
  email: string;
  role: EmailRecipientRole;
}

@Entity({ name: 'email_events' })
@Index('ix_email_events_inspection', ['inspectionId'])
@Index('ix_email_events_report', ['reportId'])
export class EmailEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'inspection_id' })
  inspectionId!: string;

  /** Reference to the report row that was attached (FK-by-convention; not a real FK so
   *  deleting an old report doesn't cascade-delete its email history). */
  @Column({ type: 'uuid', name: 'report_id' })
  reportId!: string;

  @Column({ type: 'varchar', length: 255, name: 'subject' })
  subject!: string;

  @Column({ type: 'text', default: '', name: 'body' })
  body!: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb", name: 'recipients' })
  recipients!: EmailRecipient[];

  /** Comma-separated convenience copy of the recipient list for quick scanning. */
  @Column({ type: 'varchar', length: 1024, default: '', name: 'recipient_summary' })
  recipientSummary!: string;

  @Column({ type: 'varchar', length: 16, default: 'QUEUED', name: 'status' })
  status!: EmailEventStatus;

  @Column({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage!: string | null;

  /** The user who triggered the email (admin id from JWT). */
  @Column({ type: 'uuid', nullable: true, name: 'sent_by' })
  sentBy!: string | null;

  /** Path to the .eml drop file (when running in mock mode) so admins can inspect what was actually sent. */
  @Column({ type: 'varchar', length: 512, nullable: true, name: 'eml_path' })
  emlPath!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /** Timestamp at which the transport accepted the message. */
  @Column({ type: 'timestamp', nullable: true, name: 'sent_at' })
  sentAt!: Date | null;
}
