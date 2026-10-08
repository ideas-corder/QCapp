/**
 * CategoriesEditor — REMOVED 2026-09-03.
 *
 * The Categories & AQL admin form (which let admins create / edit /
 * delete categories and attach an AQL setup per category) was removed
 * from the admin UI. The Categories & AQL link is gone from the
 * Sidebar and `/categories` now permanently redirects to `/inspections`.
 *
 * This stub component is intentionally a no-op default export so any
 * stale import (e.g. a forgotten reference in another page) compiles
 * cleanly and renders nothing instead of crashing. The full
 * implementation still lives in git history if the admin team wants
 * to re-introduce it later.
 */
export default function CategoriesEditor(_props: { initial?: unknown[] }): null {
  return null;
}
