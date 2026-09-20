/**
 * RulesModule — REMOVED 2026-09-03.
 *
 * QC Rules was retired from the admin UI and the rules engine call
 * site in InspectionsService.create() was deleted. The qc_rules table
 * and the triggered_actions column on inspections are being dropped
 * via migration 1700000025000-DropQcRulesAndTriggeredActions.
 *
 * This module is kept as an empty placeholder so that any stale
 * reference (e.g. forgotten import elsewhere) still resolves, but
 * the Nest module imports nothing, declares no controllers, and
 * provides no services. It is no longer registered in AppModule
 * or InspectionsModule.
 */
import { Module } from '@nestjs/common';

@Module({})
export class RulesModule {}
