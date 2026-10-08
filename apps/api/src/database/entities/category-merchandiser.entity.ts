import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { MerchandiserEntity } from './merchandiser.entity';
import { ProductCategoryEntity } from './product-category.entity';

/**
 * Explicit junction between product categories and merchandisers.
 *
 * Keeping this as an entity instead of using @ManyToMany allows the
 * association to retain its own timestamps and leaves room for future
 * relationship-specific fields without changing the mapping strategy.
 */
@Entity({ name: 'category_merchandisers' })
@Unique('uq_category_merchandisers_category_merchandiser', [
  'categoryId',
  'merchandiserId',
])
@Index('ix_category_merchandisers_merchandiser', ['merchandiserId'])
export class CategoryMerchandiser {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(
    () => ProductCategoryEntity,
    (category) => category.categoryMerchandisers,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'category_id' })
  category!: ProductCategoryEntity;

  @Column({ type: 'uuid', name: 'category_id' })
  categoryId!: string;

  @ManyToOne(
    () => MerchandiserEntity,
    (merchandiser) => merchandiser.categoryMerchandisers,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'merchandiser_id' })
  merchandiser!: MerchandiserEntity;

  @Column({ type: 'uuid', name: 'merchandiser_id' })
  merchandiserId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
