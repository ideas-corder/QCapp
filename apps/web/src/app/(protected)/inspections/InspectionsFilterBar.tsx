// Superseded — the global filter bar (search + multi-selects + Result /
// Sync / Debit chip rows + presets) was removed on 2026-08-30 in favour of
// per-column filters inside the inspections grid. Every capability this
// file used to expose (text search, FK multi-select, date range, enum
// chips, sort, presets) is now driven from the grid header funnel
// popovers and the column-customiser. See:
//
//   - apps/web/src/app/inspections/columns.tsx          (COLUMNS registry)
//   - apps/web/src/app/inspections/ColumnFilter.tsx     (per-column popover)
//   - apps/web/src/app/inspections/InspectionsGrid.tsx  (URL ↔ filter state)
//   - apps/web/src/app/inspections/page.tsx             (renders the grid)
//
// The file is left as a stub because the sandbox blocks `Remove-Item`.
export {};
