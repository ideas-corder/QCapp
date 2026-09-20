import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Inspection Type master data.
 *
 * Codes are admin-defined (e.g. INLINE, FINAL, DUPRO, PRE-SHIPMENT). The
 * `inspections.inspection_type` column is a plain varchar that must match an
 * active code in this table — see InspectionsService.create().
 *
 * `code` is stored uppercase to keep lookups stable; we uppercase at the
 * service layer too, so case in the UI doesn't matter.
 */
@Entity({ name: 'inspection_types' })
export class InspectionTypeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('uq_inspection_types_code', { unique: true })
  @Column({ type: 'varchar', length: 32 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  label!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}