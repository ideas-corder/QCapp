import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { InspectionViewsService } from './inspection-views.service';
import {
  CreateInspectionViewDto,
  UpdateInspectionViewDto,
} from './dto/inspection-view.dto';
import {
  AuthUser,
  CurrentUser,
  JwtAuthGuard,
} from '../auth/guards/roles.guard';

@Controller('inspection-views')
@UseGuards(JwtAuthGuard)
export class InspectionViewsController {
  constructor(private readonly service: InspectionViewsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.userId);
  }

  @Get(':id')
  getById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getById(id, user.userId);
  }

  @Post()
  create(@Body() dto: CreateInspectionViewDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.userId);
  }

  @Put(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateInspectionViewDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user.userId);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.service.remove(id, user.userId);
  }
}