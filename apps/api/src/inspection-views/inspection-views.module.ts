import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InspectionViewsController } from './inspection-views.controller';
import { InspectionViewsService } from './inspection-views.service';
import { InspectionViewEntity } from '../database/entities/inspection-view.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InspectionViewEntity])],
  controllers: [InspectionViewsController],
  providers: [InspectionViewsService],
  exports: [InspectionViewsService],
})
export class InspectionViewsModule {}