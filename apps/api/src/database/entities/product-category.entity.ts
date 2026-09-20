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
 * Product Category master data.
 *
 * Independent from the existing Category master — this is the
 * "what kind of product is being inspected" classification that the
 * inspector picks on the new-inspection form (e.g. Apparel, Footwear,
 * Electronics). It does NOT carry AQL config (that lives on the legacy
 * `categories` table); it's intentionally lightweight so admins can
 * maintain it without coupling to AQL setup.
 *
 * `code` is stored uppercase for stable lookups; the service uppercases
 * on the way in too.
 */
@Entity({ name: 'product_categories' })
export class ProductCategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('uq_product_categories_code', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  // For dashboard joins / inspection detail pages. Inspections now carry
  // a nullable `product_category_id` column so existing data isn't broken.
  @OneToMany(() => InspectionEntity, (i) => i.productCategory)
  inspections!: InspectionEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
