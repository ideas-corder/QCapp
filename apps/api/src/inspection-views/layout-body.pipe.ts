// Superseded.
//
// The original purpose was to bypass the global ValidationPipe's
// whitelist so the loosely-typed `layout` JSON would survive. The
// fix turned out to be simpler: decorating the `layout` field on
// the DTO with `@IsObject()` makes the global whitelist keep it.
//
// This file is intentionally left empty so the import surface in
// `inspection-views.controller.ts` (already migrated to plain
// `@Body()`) doesn't need a deletion ceremony.
export {};