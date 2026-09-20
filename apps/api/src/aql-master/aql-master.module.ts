import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AqlMasterEntity } from '../database/entities/aql-master.entity';
import { AuthModule } from '../auth/auth.module';
import { AqlMasterController } from './aql-master.controller';
import { AqlMasterService } from './aql-master.service';

@Module({
  imports: [TypeOrmModule.forFeature([AqlMasterEntity]), AuthModule],
  controllers: [AqlMasterController],
  providers: [AqlMasterService],
  exports: [AqlMasterService],
})
export class AqlMasterModule {}
