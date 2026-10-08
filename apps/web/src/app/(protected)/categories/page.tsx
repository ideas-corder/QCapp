/**
 * Categories & AQL admin form — REMOVED 2026-09-03.
 *
 * The admin form for managing the legacy AQL-bearing categories master
 * has been retired. The link was removed from the Sidebar; this route
 * file is kept as a stub so any surviving deep link resolves cleanly
 * (no 404) and any stale browser tab / bookmark redirects to the
 * inspections list instead of asking the user to log in again.
 *
 * The backend API (`/categories`) and the `categories` table on the
 * NestJS side remain intact, as does the `categoryId` field on the
 * inspection entity — `categoryId` is optional on the CreateInspectionDto
 * so a brand-new inspection can be submitted without one. The New
 * Inspection form still receives the (now-empty) `categories[]` prop
 * from the parent page server-component but the dropdown just renders
 * the empty state.
 *
 * If the admin team later wants to re-introduce categories management,
 * restore the original `CategoriesEditor.tsx` implementation from git
 * history and add a new Sidebar link.
 */
import { redirect } from 'next/navigation';

export default function CategoriesPage(): never {
  // Permanent redirect — never renders. The cast to `never` is
  // intentional: `redirect()` throws internally so this function
  // doesn't actually return, and Next.js's page renderer doesn't
  // expect it to.
  redirect('/inspections');
}
