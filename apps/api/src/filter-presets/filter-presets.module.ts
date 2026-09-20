/**
 * FilterPresetsModule — REMOVED 2026-09-03.
 *
 * Filter Presets was retired from the admin UI. The /filter-presets
 * endpoints are no longer registered in this module (the module is
 * empty now) so this controller cannot be reached via HTTP. The file
 * is kept so any stale import resolves without breaking the build.
 *
 * To restore: reintroduce FilterPresetsService + the controller and
 * re-register FilterPresetsModule.forFeature([FilterPresetEntity]) in
 * AppModule.
 */
import { Module } from '@nestjs/common';

@Module({})
export class FilterPresetsModule {}
