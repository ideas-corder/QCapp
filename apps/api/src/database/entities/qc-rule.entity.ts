/**
 * QcRuleEntity — REMOVED 2026-09-03.
 *
 * QC Rules feature retired. The qc_rules table is being dropped via
 * migration 1700000025000-DropQcRulesAndTriggeredActions. The entity
 * is no longer registered with TypeORM (removed from
 * database/entities/index.ts and database/data-source.ts). Kept as
 * an empty stub so any stale import resolves cleanly.
 */
export type RuleConditionType = string;
export type RuleAction = string;
export class QcRuleEntity {}
