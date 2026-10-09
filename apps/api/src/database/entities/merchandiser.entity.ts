import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CategoryMerchandiser } from './category-merchandiser.entity';
import { ProductCategoryEntity } from './product-category.entity';

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

  @OneToMany(
    () => CategoryMerchandiser,
    (categoryMerchandiser) => categoryMerchandiser.merchandiser,
  )
  categoryMerchandisers!: CategoryMerchandiser[];

  /**
   * Convenience view over the explicit junction rows. Callers must load
   * `categoryMerchandisers.category` when querying the merchandiser.
   */
  get productCategories(): ProductCategoryEntity[] {
    return (this.categoryMerchandisers ?? [])
      .map((association) => association.category)
      .filter(
        (category): category is ProductCategoryEntity => !!category,
      );
  }

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
