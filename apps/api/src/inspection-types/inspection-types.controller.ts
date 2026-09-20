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
  CreateInspectionTypeDto,
  UpdateInspectionTypeDto,
} from './dto/inspection-type.dto';
import { InspectionTypesService } from './inspection-types.service';

export class BulkImportInspectionTypesDto {
  @IsString()
  @MinLength(2)
  csv!: string;
}

@Controller('inspection-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InspectionTypesController {
  constructor(private readonly service: InspectionTypesService) {}

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
  create(@Body() dto: CreateInspectionTypeDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @Roles('admin')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateInspectionTypeDto,
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
  async bulkImport(@Body() dto: BulkImportInspectionTypesDto) {
    return this.service.bulkImport(dto.csv);
  }
}