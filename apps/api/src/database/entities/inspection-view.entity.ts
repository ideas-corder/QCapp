import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

/**
 * Shape persisted in the `layout` JSONB column. The frontend is the
 * authority on what columns exist (its own definition table) — we
 * just persist the user's choices per view.
 *
 *  - `columnOrder`:    visible column keys in display order
 *  - `hiddenColumns`:  columns the user explicitly hid
 *  - `widths`:         px widths keyed by column key (drag-resized)
 *  - `sortBy`:         (optional) the sort the view was saved under
 *  - `filters`:        (optional) snapshot of filter state at save time
 *
 * Unrecognised keys are ignored on load so older views keep working
 * when new columns are added to the grid.
 */
export interface InspectionViewLayoutJson {
  columnOrder?: string[];
  hiddenColumns?: string[];
  widths?: Record<string, number>;
  sortBy?: string;
  filters?: Record<string, unknown>;
}

@Entity({ name: 'inspection_views' })
@Index('ix_inspection_views_owner', ['ownerId'])
export class InspectionViewEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  /**
   * True only for the system-provided "Default" view that always
   * shows every column. Built-ins are owned by the system (ownerId
   * NULL) and cannot be deleted or renamed.
   */
  @Column({ type: 'boolean', default: false, name: 'is_built_in' })
  isBuiltIn!: boolean;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  layout!: InspectionViewLayoutJson;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner!: UserEntity | null;

  @Column({ type: 'uuid', nullable: true, name: 'owner_id' })
  ownerId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}