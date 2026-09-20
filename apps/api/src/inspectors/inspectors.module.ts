import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InspectorEntity } from '../database/entities/inspector.entity';
import { AuthModule } from '../auth/auth.module';
import { InspectorsController } from './inspectors.controller';
import { InspectorsService } from './inspectors.service';

@Module({
  imports: [TypeOrmModule.forFeature([InspectorEntity]), AuthModule],
  controllers: [InspectorsController],
  providers: [InspectorsService],
  exports: [InspectorsService],
})
export class InspectorsModule {}
