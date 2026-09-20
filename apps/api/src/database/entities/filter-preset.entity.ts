/**
 * FilterPresetEntity — REMOVED 2026-09-03.
 *
 * Filter Presets feature retired. The filter_presets table is being
 * dropped via migration 1700000026000-DropFilterPresets. The entity
 * is no longer registered with TypeORM (removed from
 * database/entities/index.ts and database/data-source.ts). Kept as
 * an empty stub so any stale import resolves cleanly.
 */
export interface FilterCriteriaJson {
  // Kept so any stale type reference still compiles. The interface
  // is no longer exported anywhere or used by any consumer.
  searchQuery?: string;
}
export class FilterPresetEntity {}
