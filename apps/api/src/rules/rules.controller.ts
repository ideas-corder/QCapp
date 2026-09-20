/**
 * RulesController — REMOVED 2026-09-03.
 *
 * QC Rules admin API was retired. The /rules endpoints are no longer
 * registered in RulesModule (the module is empty now) so this
 * controller cannot be reached via HTTP. The file is kept so any
 * stale import resolves without breaking the build.
 *
 * To restore: reintroduce RulesService + RulesEngine and re-register
 * RulesModule.forFeature([QcRuleEntity]) in AppModule.
 */
// Intentionally empty — module declares no controllers now.
export class RulesController {}
