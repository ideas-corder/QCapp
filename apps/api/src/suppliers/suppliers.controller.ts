import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guards/roles.guard';
import { IsString, MinLength } from 'class-validator';

export class BulkImportSuppliersDto {
  @IsString()
  @MinLength(2)
  csv!: string;
}

@Controller('suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  list() {
    return this.suppliersService.list();
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.suppliersService.getById(id);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Put(':id')
  @Roles('admin')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliersService.update(id, dto);
  }

  @Post('bulk-import')
  @Roles('admin')
  async bulkImport(@Body() dto: BulkImportSuppliersDto) {
    return this.suppliersService.bulkImport(dto.csv);
  }
}
