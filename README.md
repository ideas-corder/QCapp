# QC Inspector — Enterprise QA & Inspection Platform

A full rewrite of the legacy Android (Compose + Firebase) inspection app into a
three-tier monorepo:

| Tier    | Stack                                                                                    |
| ------- | ---------------------------------------------------------------------------------------- |
| Mobile  | **Flutter** (3.24+) — offline-first drafts, photo capture, signature, auto-sync          |
| Web     | **Next.js** (App Router, 14.x) — admin portal with Tailwind                               |
| API     | **NestJS 10 + TypeORM** — JWT + TOTP MFA, RBAC, rules engine, PDF reports                 |
| Database | **PostgreSQL 18** in Docker                                                              |

## What's in here

- **Mobile app** (`apps/mobile/`) — login + MFA, dashboard, inspection form with
  live AQL sampling math, photo capture (`image_picker`), signature pad,
  offline drafts in `sqflite`, automatic background sync, history list.
- **Web admin** (`apps/web/`) — login, dashboard with stats, inspections list
  with full filtering, inspection detail view, PDF download, rules editor,
  suppliers manager, categories + per-category AQL setup, filter presets.
- **API** (`apps/api/`) — JWT auth with TOTP MFA step-up for admins, AQL
  sampling math (port of the original Kotlin code), rules engine that
  evaluates enabled rules on every submitted inspection, photo uploads,
  PDF report generation with `pdfkit`, OpenAPI docs at `/docs`.

## Architecture map

```
qc-platform/
├── apps/
│   ├── api/      # NestJS + TypeORM + Postgres
│   ├── web/      # Next.js admin portal (Tailwind)
│   └── mobile/   # Flutter mobile app
├── infra/        # docker-compose.yml (Postgres 18)
└── scripts/      # smoke.mjs (end-to-end API test)
```

## Quick start

### 1. Bring up Postgres

```bash
# from the qc-platform/ directory
docker compose -f infra/docker-compose.yml up -d postgres
```

### 2. Install dependencies

```bash
# Pick one — pnpm is preferred for the workspace
pnpm install
```

If you don't have pnpm:

```bash
npm install -g pnpm@9
```

### 3. Configure env

```bash
cp .env.example .env
# Edit JWT_ACCESS_SECRET, JWT_REFRESH_SECRET — make them long random strings!
```

### 4. Run migrations + seed

```bash
pnpm api:migrate     # creates tables
pnpm api:seed        # admin user, demo inspector, categories, suppliers, rules
```

After seed, login credentials:

- **admin** — `admin@qc.local` / `Admin@123` (MFA disabled; enroll via API)
- **inspector** — `inspector@qc.local` / `Inspector@123` (MFA disabled)

### 5. Run the API

```bash
pnpm api:dev
# → http://localhost:3002
# → Swagger UI: http://localhost:3002/docs
```

### 6. Run the web admin

```bash
pnpm web:dev
# → http://localhost:3001
```

### 7. Run the mobile app

```bash
# Install Flutter SDK 3.24+ first if you don't have it
pnpm mobile:pub
pnpm mobile:run
```

The mobile app defaults to `http://10.0.2.2:3000` (Android emulator's loopback
to host). Pass `--dart-define=API_URL=...` for other targets:

```bash
cd apps/mobile
flutter run --dart-define=API_URL=http://192.168.1.100:3000
```

## Smoke test

```bash
# Once the API is running and seeded
node scripts/smoke.mjs
```

Should print "All smoke checks passed 🎉". This exercises login, idempotent
inspection submission, listing, verify, dashboard, rules, and PDF.

## Project structure (API)

```
apps/api/src/
├── auth/            # JWT + TOTP MFA (login step 1, login step 2, refresh, enroll, confirm)
├── users/           # User entity module
├── inspections/     # CRUD + dashboard + verify
├── categories/      # Categories + per-category AQL setup
├── suppliers/       # Suppliers + risk tier + quality score
├── rules/           # QC rules CRUD + rules engine
├── filter-presets/  # Custom filter presets (built-in + per-user)
├── uploads/         # Photo upload + serving
├── reports/         # PDF generation
├── common/          # AQL math (shared algorithm)
└── database/        # Entities + initial migration + seed
```

## AQL sampling math

The AQL sampling table is the original ISO 2859-1 logic from the legacy
Android source. It's been ported **verbatim** into three places, kept in sync:

1. `apps/api/src/common/aql.ts` (TypeScript — the source of truth on the server)
2. `apps/mobile/lib/models/aql.dart` (Dart — used on-device to pre-compute the
   sample size for the inspector)
3. `apps/web` reads it through the API only.

A unit test (`apps/api/test/aql.spec.ts`) and a Flutter test
(`apps/mobile/test/aql_test.dart`) cover the core cases — run them after any
change.

## Rules engine

Rules evaluate **automatically on every submitted inspection** (admin and
inspector alike). Each rule has:

- A **condition** — `CRITICAL_DEFECT_GT`, `MAJOR_DEFECT_GT`, `TOTAL_DEFECT_GT`,
  `LOT_SIZE_GT`, or `FAIL_RATE_GT` (supplier fail rate, computed live)
- A **threshold**
- An **action** — `QUARANTINE_LOT`, `ISSUE_DEBIT_NOTE`, `MANDATORY_LEVEL_III`,
  `ESCALATE_DIRECTOR`, `FLAG_HIGH_RISK`
- An optional **category target** so rules fire only for one category

When triggered, the action is stored on the inspection under
`triggered_actions` and visible in both the web admin detail view and the
generated PDF report.

## Auth flow

1. `POST /auth/login` with email + password
   - If the user has MFA enabled, returns `{ mode: 'mfa_required', mfaPendingToken }`
   - Otherwise returns `{ mode: 'authenticated', accessToken, refreshToken }`
2. If MFA required, `POST /auth/login/mfa` with `{ mfaPendingToken, totpCode }`
3. `POST /auth/refresh` to rotate tokens
4. `POST /auth/mfa/enroll` (admin only by policy) — returns QR code + secret
5. `POST /auth/mfa/confirm` with the first TOTP code to enable MFA

Enrolling an admin: sign in, hit `/auth/mfa/enroll` (Bearer token in header),
scan the QR with Google Authenticator / Authy / 1Password, then call
`/auth/mfa/confirm` with a current 6-digit code.

## Notes / known gaps

- **Custom supplier flow on mobile.** When the inspector toggles "Custom
  supplier", the form asks for a name but the API requires a UUID supplier
  reference. The current mobile code rejects the submission in that case.
  Production fix: add a `POST /suppliers/quick` endpoint that creates a
  throwaway supplier and returns its ID, then call it from the mobile form.
- **Photo capture on web admin** — the admin portal shows photos that mobile
  uploaded, but doesn't have its own capture UI. Adding one is straightforward
  (reuse the API's `POST /uploads/photo`).
- **Real-time updates** — neither admin nor mobile has WebSockets. The mobile
  pulls on demand; the admin does `cache: 'no-store'` server fetches. Acceptable
  for an internal QC tool, add `socket.io` later if needed.
- **Multi-tenancy** — single tenant. Add `organization_id` columns + tenant
  middleware before any real customer rollout.
- **MFA enforcement policy** is read from `MFA_REQUIRED_FOR_ROLES` env (default
  empty). Set `MFA_REQUIRED_FOR_ROLES=admin,inspector` to force MFA for everyone
  with that role — that gate is checked at login on the backend but isn't
  wired into a hard guard yet; recommend running a small middleware.

## Repository conventions (for future agents + new clones)

### Required `.env` files (NEVER committed — gitignored)

The repo only ships `.env.example` files. **Every clone must create real `.env` files** before running the stack, or `pnpm dev` / `npx nest start` will fail with `TypeError: Cannot read properties of undefined`.

| Path | Purpose |
|---|---|
| `apps/api/.env` | `DATABASE_URL` + `DB_*` host creds, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `MFA_*`, `SMTP_*`, optional `MFA_REQUIRED_FOR_ROLES`. **Sensitive** — do not commit. |
| `apps/web/.env` | `NEXT_PUBLIC_API_URL=http://localhost:3002` (only public value; cookies are HttpOnly). |
| `.env` (root) | currently empty; reserved for monorepo-level overrides. |

### How to bring up a fresh clone

```bash
# 1. Postgres
docker compose -f infra/docker-compose.yml up -d

# 2. Create the api env (copy from example, then fill in real values)
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env -- set DB password, JWT secrets, MFA keys, SMTP creds

# 3. Install + migrate + seed
pnpm install
pnpm --filter api migration:run       # TypeORM migrations in apps/api/src/database/migrations/
pnpm --filter api seed                # creates the bootstrap admin@qc.local / Admin@123

# 4. Run
pnpm --filter api start               # API on :3002
pnpm --filter web dev                 # Web on :3001
```

Default seed users (from `apps/api/src/database/seed.ts`):
- `admin@qc.local` / `Admin@123` (super-admin)
- `inspector@qc.local` / (set in seed) (inspector, mfaEnabled=true)
- New users (`awais@qc.local` etc.) are minted via the Users editor — password resets go through `POST /users/:id/reset-password` (super-admin only).

### Stack pinned versions

- Node 22+, pnpm 9+, NestJS 10, TypeORM 0.3, Next.js 14 (App Router), Flutter 3.24+
- PostgreSQL 18 in `infra/docker-compose.yml`
- Tailwind 3 (web)
- `pdfkit` for reports; no headless browser — reports are programmatic PDFs

### Role / RBAC contract

- Three roles: `admin`, `inspector`, `viewer`. `isSuperAdmin` flag is **independent** of `role` (a `viewer` can still be super-admin).
- API guards: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('admin', ...)` per controller. **Some endpoints (e.g. `/inspections/dashboard`) include `inspector` deliberately** — see inline comment in `apps/api/src/inspections/inspections.controller.ts:41-47` before changing.
- **Row-level scoping on `/inspections`**: non-admin callers only see rows where `inspector_id = caller.userId`. Implemented in `apps/api/src/inspections/inspections.service.ts:441-451` (`canSeeAllRows(caller)` + the `qb.andWhere('i.inspector_id = :scopeUserId', ...)` line). `getById()` enforces the same with a 403 (not 404) at lines 405-411.
- **Sidebar gating** lives in `apps/web/src/components/Sidebar.tsx:buildGroups(role, isSuperAdmin)`. Inspectors see ONLY a single `My Work > Inspections` link; everything else is admin-only or super-admin-only.
- **Post-login redirect**: `apps/web/src/app/login/page.tsx:landingPath(user)` sends inspectors to `/inspections`; admins and viewers land on `/dashboard`.
- Role is decoded from the JWT payload server-side in `apps/web/src/lib/auth.ts:getCallerFromCookie()` (no signature check on the web side — the API guards verify on every request).

### Local-only artefacts to never commit (already in `.gitignore`)

- `node_modules/`, `.next/`, `dist/`, `apps/api/uploads/`, `apps/api/storage/`, `apps/api/test-output/`, `*.log`, `*.bak`, dev-leftover `apps/api/qc-probe-*.js` debug scripts, `apps/api/preview-detail-report.cjs`, `apps/api/start-api.bat`, `apps/web/start-web.bat`, `apps/mobile/tmp_apk_*/`, `apps/instructions.txt`.

### Where to look when…

| Symptom | Look in |
|---|---|
| Login error "Invalid credentials" / friendly translation | `apps/api/src/auth/auth.service.ts:loginStep1` + `apps/web/src/lib/api-client.ts:friendlyApiError` |
| Dashboard 403 / row-scoping bug | `apps/api/src/inspections/inspections.controller.ts` + `apps/api/src/inspections/inspections.service.ts:list()` |
| Sidebar shows wrong links | `apps/web/src/components/Sidebar.tsx:buildGroups` |
| Wrong role badge in header | `apps/web/src/app/layout.tsx` (uses `getCallerFromCookie`) |
| Inspector lands on wrong page after login | `apps/web/src/app/login/page.tsx:landingPath` |
| MFA gating | `apps/api/src/auth/auth.service.ts` reads `MFA_REQUIRED_FOR_ROLES` env |
| AQL math off | `apps/api/src/common/aql.ts` is the source of truth; `apps/mobile/lib/models/aql.dart` must match |
| PDF report rendering | `apps/api/src/reports/detail-report.builder.ts` + `report-storage.service.ts` (no headless browser — programmatic) |
| Schema migrations out of sync | `apps/api/src/database/migrations/` — 28 files in chronological order; do NOT rewrite, append new ones |
