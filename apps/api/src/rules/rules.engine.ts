/**
 * RulesEngine — REMOVED 2026-09-03.
 *
 * QC Rules was retired. InspectionsService no longer calls
 * rulesEngine.evaluate(); the call site in create() has been removed.
 * RulesEngine is no longer provided in RulesModule, so this class
 * cannot be instantiated by Nest. Kept as a no-op stub so any stale
 * import resolves cleanly.
 */
export interface TriggeredAction {
  action: string;
  ruleId: string;
  ruleTitle: string;
}
export class RulesEngine {
  // Kept so any stale `new RulesEngine(...)` reference compiles. The
  // class is not registered as a Nest provider anywhere.
  evaluate(_inspectionId: string): Promise<TriggeredAction[]> {
    return Promise.resolve([]);
  }
}
