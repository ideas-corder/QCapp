import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InspectionEntity } from './inspection.entity';

/**
 * Inspector master data — the people who *sign* inspections.
 *
 * Distinct from `UserEntity` (which is for app login accounts). An
 * inspector may or may not have a login — they may simply be on the
 * factory floor filling out paperwork. We keep them on a lightweight
 * roster so admins can curate the picker on the new-inspection form
 * without juggling user accounts.
 *
 * `code` is stored uppercase for stable lookups; service uppercases on
 * the way in.
 */
@Entity({ name: 'inspectors' })
export class InspectorEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('uq_inspectors_code', { unique: true })
  @Column({ type: 'varchar', length: 32 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  phone!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @OneToMany(() => InspectionEntity, (i) => i.inspectorMaster)
  inspections!: InspectionEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
