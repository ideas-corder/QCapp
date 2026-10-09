import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductCategoryEntity } from '../database/entities/product-category.entity';
import { CategoryMerchandiser } from '../database/entities/category-merchandiser.entity';
import { AuthModule } from '../auth/auth.module';
import { ProductCategoriesController } from './product-categories.controller';
import { ProductCategoriesService } from './product-categories.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductCategoryEntity, CategoryMerchandiser]),
    AuthModule,
  ],
  controllers: [ProductCategoriesController],
  providers: [ProductCategoriesService],
  exports: [ProductCategoriesService],
})
export class ProductCategoriesModule {}
