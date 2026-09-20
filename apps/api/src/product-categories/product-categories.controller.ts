import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
} from './dto/product-category.dto';
import { ProductCategoriesService } from './product-categories.service';

export class BulkImportProductCategoriesDto {
  @IsString()
  @MinLength(2)
  csv!: string;
}

@Controller('product-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductCategoriesController {
  constructor(private readonly service: ProductCategoriesService) {}

  @Get()
  list(@Query('activeOnly') activeOnly?: string) {
    return this.service.list({ activeOnly: activeOnly === 'true' });
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getById(id);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateProductCategoryDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @Roles('admin')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductCategoryDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }

  @Post('bulk-import')
  @Roles('admin')
  async bulkImport(@Body() dto: BulkImportProductCategoriesDto) {
    return this.service.bulkImport(dto.csv);
  }
}
