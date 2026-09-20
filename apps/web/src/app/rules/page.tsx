/**
 * QC Rules admin form — REMOVED 2026-09-03.
 *
 * The QC Rules feature (auto-quarantine / issue debit note / escalate
 * director / flag high risk) was retired. The rules engine wasn't wired
 * into any user-facing flow and added cognitive overhead to the admin
 * nav. The rules engine call from InspectionsService was removed at the
 * same time, and the `qc_rules` table + `triggered_actions` jsonb
 * column on `inspections` are being dropped via migration
 * 1700000025000-DropQcRulesAndTriggeredActions.
 *
 * This stub file is kept so any surviving deep link resolves cleanly
 * (no 404) and any stale browser tab / bookmark redirects to the
 * inspections list instead of bouncing to /login (the original page
 * required a `qc_access` cookie to fetch `/rules`, which would 401
 * once the cookie expired).
 *
 * To restore: re-introduce `RulesModule` on the api side and the
 * Sidebar link from git history.
 */
import { redirect } from 'next/navigation';

export default function RulesPage(): never {
  // Permanent redirect — never renders. The `never` return is
  // intentional: `redirect()` throws internally, so this function
  // doesn't actually return, and Next.js's page renderer doesn't
  // expect it to.
  redirect('/inspections');
}
