import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// D365 F&O vendor account format, e.g. VEN-005036
export const VENDOR_ID_REGEX = /^VEN-\d{6}$/;

@Entity({ name: 'suppliers' })
export class SupplierEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 32, nullable: true, unique: true, name: 'vendor_id' })
  @Index('uq_suppliers_vendor_id', { where: '"vendor_id" IS NOT NULL' })
  vendorId!: string | null;

  @Column({ type: 'varchar', length: 255, unique: true })
  name!: string;

  @Column({ type: 'boolean', default: false, name: 'require_double_inspection' })
  requireDoubleInspection!: boolean;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, name: 'auto_debit_note_limit' })
  autoDebitNoteLimit!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
