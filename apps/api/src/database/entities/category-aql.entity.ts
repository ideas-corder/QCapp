import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CategoryEntity } from './category.entity';

@Entity({ name: 'category_aql_setups' })
export class CategoryAqlSetupEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => CategoryEntity, (c) => c.aqlSetup, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category!: CategoryEntity;

  @Column({ type: 'uuid', name: 'category_id' })
  categoryId!: string;

  @Column({ type: 'numeric', precision: 4, scale: 2, name: 'default_aql_major' })
  defaultAqlMajor!: string;

  @Column({ type: 'numeric', precision: 4, scale: 2, name: 'default_aql_minor' })
  defaultAqlMinor!: string;

  @Column({ type: 'varchar', length: 32, name: 'inspection_level' })
  inspectionLevel!: string;

  @Column({ type: 'boolean', default: true, name: 'auto_fail_on_critical' })
  autoFailOnCritical!: boolean;

  @Column({ type: 'boolean', default: false, name: 'strict_mode' })
  strictMode!: boolean;

  @Column({ type: 'integer', default: 10, name: 'max_allowed_defects' })
  maxAllowedDefects!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
