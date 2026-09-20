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
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  UpdateCategoryAqlDto,
  UpdateCategoryDto,
} from './dto/category.dto';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guards/roles.guard';
import { IsString, MinLength } from 'class-validator';

export class BulkImportCategoriesDto {
  @IsString()
  @MinLength(2)
  csv!: string;
}

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  list() {
    return this.categoriesService.list();
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.categoriesService.getById(id);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Put(':id')
  @Roles('admin')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Put(':id/aql')
  @Roles('admin')
  setAql(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCategoryAqlDto,
  ) {
    return this.categoriesService.setAql(id, dto);
  }

  @Post('bulk-import')
  @Roles('admin')
  async bulkImport(@Body() dto: BulkImportCategoriesDto) {
    return this.categoriesService.bulkImport(dto.csv);
  }
}
