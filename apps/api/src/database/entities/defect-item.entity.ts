import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InspectionEntity } from './inspection.entity';

export type DefectSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR';

@Entity({ name: 'defect_items' })
export class DefectItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => InspectionEntity, (i) => i.defects, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inspection_id' })
  inspection!: InspectionEntity;

  @Column({ type: 'uuid', name: 'inspection_id' })
  inspectionId!: string;

  @Column({ type: 'varchar', length: 32 })
  severity!: DefectSeverity;

  @Column({ type: 'varchar', length: 255 })
  description!: string;

  @Column({ type: 'integer', default: 1 })
  quantity!: number;

  @Column({ type: 'text', default: '' })
  remarks!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
