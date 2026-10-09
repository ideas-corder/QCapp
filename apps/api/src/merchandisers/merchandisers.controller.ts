import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateMerchandiserDto,
  ListMerchandisersQueryDto,
  UpdateMerchandiserDto,
} from './dto/merchandiser.dto';
import { MerchandisersService } from './merchandisers.service';

@Controller('merchandisers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MerchandisersController {
  constructor(private readonly service: MerchandisersService) {}

  @Get()
  list(@Query() query: ListMerchandisersQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getById(id);
  }

  @Roles('admin')
  @Post()
  create(@Body() dto: CreateMerchandiserDto) {
    return this.service.create(dto);
  }

  @Roles('admin')
  @Put(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMerchandiserDto,
  ) {
    return this.service.update(id, dto);
  }

}
