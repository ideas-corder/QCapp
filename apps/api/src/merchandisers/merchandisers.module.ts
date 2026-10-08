import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MerchandiserEntity } from '../database/entities/merchandiser.entity';
import { MerchandisersController } from './merchandisers.controller';
import { MerchandisersService } from './merchandisers.service';

@Module({
  imports: [TypeOrmModule.forFeature([MerchandiserEntity]), AuthModule],
  controllers: [MerchandisersController],
  providers: [MerchandisersService],
  exports: [MerchandisersService],
})
export class MerchandisersModule {}
