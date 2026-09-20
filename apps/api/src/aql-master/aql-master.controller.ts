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
  CreateAqlMasterDto,
  UpdateAqlMasterDto,
} from './dto/aql-master.dto';
import { AqlMasterService } from './aql-master.service';

export class BulkImportAqlMasterDto {
  @IsString()
  @MinLength(2)
  csv!: string;
}

@Controller('aql-master')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AqlMasterController {
  constructor(private readonly service: AqlMasterService) {}

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
  create(@Body() dto: CreateAqlMasterDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @Roles('admin')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAqlMasterDto,
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
  async bulkImport(@Body() dto: BulkImportAqlMasterDto) {
    return this.service.bulkImport(dto.csv);
  }
}
