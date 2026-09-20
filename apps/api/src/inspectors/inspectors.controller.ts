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
import { CreateInspectorDto, UpdateInspectorDto } from './dto/inspector.dto';
import { InspectorsService } from './inspectors.service';

export class BulkImportInspectorsDto {
  @IsString()
  @MinLength(2)
  csv!: string;
}

@Controller('inspectors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InspectorsController {
  constructor(private readonly service: InspectorsService) {}

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
  create(@Body() dto: CreateInspectorDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @Roles('admin')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateInspectorDto,
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
  async bulkImport(@Body() dto: BulkImportInspectorsDto) {
    return this.service.bulkImport(dto.csv);
  }
}
