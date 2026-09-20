import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import {
  CreateInspectionDto,
  ListInspectionsQuery,
} from './dto/inspection.dto';
import {
  AuthUser,
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
} from '../auth/guards/roles.guard';

@Controller('inspections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InspectionsController {
  constructor(private readonly service: InspectionsService) {}

  @Get()
  list(@Query() q: ListInspectionsQuery, @CurrentUser() user: AuthUser) {
    return this.service.list(q, {
      userId: user.userId,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
    });
  }

  @Get('dashboard')
  // Aggregate stats are read-only — any logged-in role (admin, inspector,
  // viewer) should see them. The previous `@Roles('admin', 'viewer')`
  // excluded inspectors, but they're the ones filling out inspections and
  // most need the dashboard. If you ever want to hide it from viewers,
  // change this back; for now keep it open to all three roles.
  @Roles('admin', 'inspector', 'viewer')
  dashboard() {
    return this.service.dashboardStats();
  }

  @Get(':id')
  getById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.getById(id, {
      userId: user.userId,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
    });
  }

  @Get(':id/verify')
  verify(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getById(id).then((i) => {
      const serverVerified = this.service.verifyOutcome(i);
      // REWORK / HOLD / REJECTED are inspector overrides — they're
      // legitimate verdicts in their own right, so we treat them as
      // always matching (the server can't infer them from the defect
      // list alone). For PASS/FAIL/PENDING_REVIEW we still require the
      // inspector's claimed verdict to agree with what the AQL rules
      // would have produced.
      const matches =
        i.overallResult === 'REWORK' ||
        i.overallResult === 'HOLD' ||
        i.overallResult === 'REJECTED' ||
        i.overallResult === serverVerified;
      return {
        id: i.id,
        overallResult: i.overallResult,
        serverVerified,
        matches,
      };
    });
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateInspectionDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.userId);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.service.remove(id);
  }
}
