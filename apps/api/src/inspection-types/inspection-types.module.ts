import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InspectionTypeEntity } from '../database/entities/inspection-type.entity';
import { AuthModule } from '../auth/auth.module';
import { InspectionTypesController } from './inspection-types.controller';
import { InspectionTypesService } from './inspection-types.service';

@Module({
  imports: [TypeOrmModule.forFeature([InspectionTypeEntity]), AuthModule],
  controllers: [InspectionTypesController],
  providers: [InspectionTypesService],
  exports: [InspectionTypesService],
})
export class InspectionTypesModule {}