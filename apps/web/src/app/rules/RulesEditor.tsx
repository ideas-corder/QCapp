/**
 * RulesEditor — REMOVED 2026-09-03.
 *
 * The QC Rules admin editor (list / create / toggle / update / delete /
 * bulk-import rules) was retired alongside the entire QC Rules feature.
 * The Sidebar link is gone and `/rules` now permanently redirects to
 * `/inspections`. This stub component is a no-op default export so any
 * stale import (e.g. a forgotten reference in another page) compiles
 * cleanly and renders nothing instead of crashing. The full
 * implementation still lives in git history if the admin team wants
 * to re-introduce it later.
 */
export default function RulesEditor(_props: {
  initialRules?: unknown[];
  categories?: unknown[];
}): null {
  return null;
}
