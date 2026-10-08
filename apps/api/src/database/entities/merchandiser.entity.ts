import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Admin-managed merchandiser master data. */
@Entity({ name: 'merchandisers' })
export class MerchandiserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Index('uq_merchandisers_email', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Index('ix_merchandisers_active')
  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
