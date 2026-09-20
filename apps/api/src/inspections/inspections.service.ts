import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { InspectionEntity } from '../database/entities/inspection.entity';
import { InspectionTypeEntity } from '../database/entities/inspection-type.entity';
import { InspectorEntity } from '../database/entities/inspector.entity';
import { ProductCategoryEntity } from '../database/entities/product-category.entity';
import { DefectItemEntity } from '../database/entities/defect-item.entity';
import { PhotoEntity } from '../database/entities/photo.entity';
import { AqlMasterEntity } from '../database/entities/aql-master.entity';
// RulesEngine was removed on 2026-09-03 — QC Rules feature retired.
// The rules engine call in create() has been deleted; the triggeredActions
// initializer has been removed too (the jsonb column is being dropped).
import {
  CreateInspectionDto,
  DashboardStats,
  ListInspectionsQuery,
} from './dto/inspection.dto';
import { evaluateOutcome } from '../common/aql';
import { ReportsService } from '../reports/reports.service';
import {
  getColumnRule,
  parseColumnFilters,
  type FilterEntry,
} from './column-filter.registry';

/**
 * Caller identity passed in from the controller. Drives per-row
 * scoping on `list()` and `getById()`:
 *
 *   - `role === 'admin'` OR `isSuperAdmin === true`  → sees every row
 *   - everyone else                                  → sees only the
 *                                                      rows whose
 *                                                      `inspector_id`
 *                                                      equals their
 *                                                      own user id.
 *
 * The super-admin flag is checked first so a future super-admin
 * whose `role` is still 'inspector' (no UI to flip roles on
 * bootstrap owner exists) isn't accidentally scoped down.
 */
export interface CallerScope {
  userId: string;
  role: 'admin' | 'inspector' | 'viewer';
  isSuperAdmin: boolean;
}

function canSeeAllRows(caller: CallerScope): boolean {
  return caller.role === 'admin' || caller.isSuperAdmin === true;
}

@Injectable()
export class InspectionsService {
  private readonly logger = new Logger(InspectionsService.name);

  /**
   * Per-severity queue of defect ids + the next photo-to-defect
   * pairing cursor. Built inside `create()` after the defects block
   * persists the rows so the photos block can attach `defectId` to
   * each `DEFECT_MAJOR` / `DEFECT_MINOR` photo without forcing the
   * client to send the id explicitly. Cleared at the end of the
   * call so a subsequent create() doesn't reuse stale state.
   */
  private pendingDefectLinkage: {
    defectsBySeverity: Record<'MAJOR' | 'MINOR', string[]>;
    defectPhotoCursor: Record<'MAJOR' | 'MINOR', number>;
  } | null = null;

  constructor(
    @InjectRepository(InspectionEntity)
    private readonly inspectionRepo: Repository<InspectionEntity>,
    @InjectRepository(DefectItemEntity)
    private readonly defectRepo: Repository<DefectItemEntity>,
    @InjectRepository(PhotoEntity)
    private readonly photoRepo: Repository<PhotoEntity>,
    @InjectRepository(InspectionTypeEntity)
    private readonly inspectionTypeRepo: Repository<InspectionTypeEntity>,
    @InjectRepository(ProductCategoryEntity)
    private readonly productCategoryRepo: Repository<ProductCategoryEntity>,
    @InjectRepository(InspectorEntity)
    private readonly inspectorRepo: Repository<InspectorEntity>,
    @InjectRepository(AqlMasterEntity)
    private readonly aqlMasterRepo: Repository<AqlMasterEntity>,
    @Inject(forwardRef(() => ReportsService))
    private readonly reportsService: ReportsService,
  ) {}

  async create(
    dto: CreateInspectionDto,
    inspectorId: string | null,
  ): Promise<InspectionEntity> {
    // Idempotency check
    const existing = await this.inspectionRepo.findOne({
      where: { submissionUuid: dto.submissionUuid },
    });
    if (existing) {
      this.logger.log(
        `Submission ${dto.submissionUuid} already exists — returning existing record`,
      );
      return existing;
    }

    // Inspection Document Number — auto-assign if the client didn't send
    // one. We compute the next per-day counter by looking at how many
    // rows were already persisted for today, then format `QC-YYMMDD-NNNN`.
    // A unique-index collision on the unique constraint is surfaced to
    // the caller as a 409 (handled at the controller boundary).
    let inspectionNumber = (dto.inspectionNumber ?? '').trim();
    if (!inspectionNumber) {
      inspectionNumber = await this.nextInspectionNumber(new Date());
    }

    // Validate the inspection type against the master. Codes are case-
    // insensitive on the way in but we store them uppercase so mobile +
    // web clients can both use INLINE / inline / Inline interchangeably.
    const requestedCode = (dto.inspectionType ?? '').trim().toUpperCase();
    const typeRow = await this.inspectionTypeRepo.findOne({
      where: { code: requestedCode, isActive: true },
    });
    if (!typeRow) {
      throw new BadRequestException(
        `inspectionType "${requestedCode}" is not an active code in the inspection types master`,
      );
    }
    const inspectionType = typeRow.code;

    // Optional product-category link. If provided it must reference an
    // active row in the new master; if absent we just leave the FK null
    // so legacy / backfilled data isn't forced through.
    let productCategoryId: string | null = null;
    if (dto.productCategoryId) {
      const pc = await this.productCategoryRepo.findOne({
        where: { id: dto.productCategoryId, isActive: true },
      });
      if (!pc) {
        throw new BadRequestException(
          `productCategoryId "${dto.productCategoryId}" is not an active product category`,
        );
      }
      productCategoryId = pc.id;
    }

    // Optional inspector master link. Validated against the new
    // inspectors table; null is allowed so existing rows are not forced
    // to backfill. We also surface the chosen inspector's display name
    // into the legacy `inspector_name` column so older report views
    // that read from `inspector_name` keep working.
    let inspectorMasterId: string | null = null;
    let inspectorNameOverride: string | null = null;
    if (dto.inspectorMasterId) {
      const insp = await this.inspectorRepo.findOne({
        where: { id: dto.inspectorMasterId, isActive: true },
      });
      if (!insp) {
        throw new BadRequestException(
          `inspectorMasterId "${dto.inspectorMasterId}" is not an active inspector`,
        );
      }
      inspectorMasterId = insp.id;
      inspectorNameOverride = insp.name;
    }

    // AQL master — required, must be an active row. We snapshot the picked
    // row's sampleSize onto the inspection so the historical record is
    // self-contained. Pass/Reject counts are intentionally not copied from
    // aql_master (it no longer stores them); they're recomputed by
    // `calculateSampling()` at evaluation time. The 0/1 defaults below
    // match `calculateSampling()`'s smallest-lot fallback so the stored
    // values are still meaningful when the runtime calculator isn't run.
    const aqlRow = await this.aqlMasterRepo.findOne({
      where: { id: dto.aqlMasterId, isActive: true },
    });
    if (!aqlRow) {
      throw new BadRequestException(
        `aqlMasterId "${dto.aqlMasterId}" is not an active AQL master row`,
      );
    }

    const overallResult = dto.overallResult ?? 'PENDING_REVIEW';

    const inspection = this.inspectionRepo.create({
      submissionUuid: dto.submissionUuid,
      inspectionNumber,
      categoryId: dto.categoryId,
      productCategoryId,
      supplierId: dto.supplierId,
      inspectorMasterId,
      isCustomSupplier: dto.isCustomSupplier ?? false,
      customSupplierName: dto.customSupplierName ?? '',
      poNumber: dto.poNumber ?? '',
      itemNumber: dto.itemNumber ?? '',
      itemDescription: dto.itemDescription ?? '',
      color: dto.color ?? '',
      inspectionDate: dto.inspectionDate ?? null,
      deliveryDate: dto.deliveryDate ?? null,
      merchandiserName: dto.merchandiserName ?? '',
      orderQuantity: String(dto.orderQuantity),
      presentedQuantity: String(dto.presentedQuantity),
      inspectedQuantity: String(dto.inspectedQuantity),
      totalCartons: dto.totalCartons,
      inspectedCartons: dto.inspectedCartons,
      fabricQuality: dto.fabricQuality ?? '',
      inspectionType,
      aqlMasterId: aqlRow.id,
      codeLetter: dto.codeLetter,
      sampleSize: aqlRow.sampleSize,
      criticalAc: dto.criticalAc,
      criticalRe: dto.criticalRe,
      majorAc: 0,
      majorRe: 1,
      minorAc: dto.minorAc,
      minorRe: dto.minorRe,
      totalCritical: dto.totalCritical,
      totalMajor: dto.totalMajor,
      totalMinor: dto.totalMinor,
      overallResult,
      inspectorName: inspectorNameOverride ?? dto.inspectorName ?? '',
      inspectorNotes: dto.inspectorNotes ?? '',
      // Legacy single-Inspector signature. We keep the column for
      // backwards compatibility with rows created before the
      // multi-signer change; populate it from the QC_INSPECTOR entry
      // of the new `signatures` array so the old report / detail
      // code paths keep working.
      signatureBase64:
        (dto.signatures ?? []).find((s) => s.role === 'QC_INSPECTOR')?.dataUrl ??
        dto.signatureBase64 ??
        '',
      // Step 10 multi-signer signatures. The form sends an entry per
      // role (QC_INSPECTOR / SUPPLIER / AQM / MERCHANDISER); we drop
      // any entry with an empty dataUrl so the JSONB column is always
      // a list of *signed* blocks (and the report can iterate without
      // filtering blanks).
      signatures: (dto.signatures ?? [])
        .filter((s) => typeof s.dataUrl === 'string' && s.dataUrl.length > 0)
        .map((s) => ({
          role: s.role,
          label: s.label,
          dataUrl: s.dataUrl as string,
          signedAt: s.signedAt ?? new Date().toISOString(),
        })),
      syncStatus: 'SYNCED',
      // Step 6 Evaluation checks — we trust the form to have validated
      // (every YES has ≥1 photo URL), but normalise the snapshot here so
      // the JSONB column is always well-formed.
      evaluationChecks: (dto.evaluationChecks ?? []).map((c) => ({
        key: c.key,
        label: c.label,
        answer: c.answer,
        photoCount: c.photoUrls?.length ?? c.photoCount ?? 0,
        photoUrls: c.photoUrls ?? [],
      })),
      // Step 8 Debit note — normalise so the JSONB column is always a
      // valid `{ answer, comment }` shape even when the form omits the
      // field entirely. A Yes answer must carry a non-empty comment;
      // we trust the form for that, but the DTO validator already
      // enforces MaxLength(2000).
      debitNote: {
        answer: dto.debitNoteSnapshot?.answer ?? '',
        comment: dto.debitNoteSnapshot?.comment ?? '',
        // The form sends `photoCount` + `photoUrls[]` whenever the
        // inspector answered Yes; we persist them into the JSONB column
        // so the detail page / PDF report can render the supporting
        // photos even if the `photos` table is later pruned by
        // retention rules. Defaults are kept conservative (0 + empty
        // array) so existing clients that don't send the new fields
        // still write a valid snapshot.
        photoCount: dto.debitNoteSnapshot?.photoCount ?? 0,
        photoUrls: dto.debitNoteSnapshot?.photoUrls ?? [],
      },
      inspectorId,
    });
    const saved = await this.inspectionRepo.save(inspection);

    if (dto.defects && dto.defects.length > 0) {
      const defects = dto.defects.map((d) =>
        this.defectRepo.create({
          inspectionId: saved.id,
          severity: d.severity,
          description: d.description,
          quantity: d.quantity ?? 1,
          remarks: d.remarks ?? '',
        }),
      );
      const savedDefects = await this.defectRepo.save(defects);
      // Stash the saved defect rows so the photo-block below can pair
      // each `DEFECT_*` photo with the specific defect it documents.
      // The form pairs photos to defects by *index* within the same
      // severity bucket (Major and Minor are independent sequences on
      // the UI), so we build a per-severity queue of defect ids here.
      const defectsBySeverity: Record<'MAJOR' | 'MINOR', string[]> = {
        MAJOR: [],
        MINOR: [],
      };
      for (const d of savedDefects) {
        if (d.severity === 'MAJOR' || d.severity === 'MINOR') {
          defectsBySeverity[d.severity].push(d.id);
        }
      }
      // Photo-kind → per-severity index counter. Each defect-kind
      // photo consumes one slot from the matching severity bucket.
      const defectPhotoCursor: Record<'MAJOR' | 'MINOR', number> = {
        MAJOR: 0,
        MINOR: 0,
      };
      this.pendingDefectLinkage = { defectsBySeverity, defectPhotoCursor };
    } else {
      this.pendingDefectLinkage = null;
    }

    if (dto.photos && dto.photos.length > 0) {
      const photos = dto.photos.map((p) => {
        // Resolve the per-defect FK for `DEFECT_*` photos. The form
        // sends `defectId` directly when available; otherwise we fall
        // back to the per-severity queue built above so legacy
        // payloads that pre-date the new field still link correctly.
        let defectId: string | null = p.defectId ?? null;
        let severity: 'MAJOR' | 'MINOR' | null = p.severity ?? null;
        if (
          (p.kind === 'DEFECT_MAJOR' || p.kind === 'DEFECT_MINOR') &&
          this.pendingDefectLinkage
        ) {
          const bucket: 'MAJOR' | 'MINOR' =
            p.kind === 'DEFECT_MAJOR' ? 'MAJOR' : 'MINOR';
          const queue = this.pendingDefectLinkage.defectsBySeverity[bucket];
          const idx = this.pendingDefectLinkage.defectPhotoCursor[bucket]++;
          if (defectId == null && queue && idx < queue.length) {
            defectId = queue[idx];
          }
          if (severity == null) severity = bucket;
        }
        return this.photoRepo.create({
          inspectionId: saved.id,
          url: p.url,
          thumbnailUrl: p.thumbnailUrl ?? null,
          mimeType: p.mimeType ?? null,
          size: p.size ?? null,
          width: p.width ?? null,
          height: p.height ?? null,
          caption: p.caption ?? '',
          kind: p.kind ?? 'INSPECTION',
          severity,
          defectId,
        });
      });
      await this.photoRepo.save(photos);
    }
    // Clear the linkage queue so a follow-up call doesn't pick up
    // stale counters. Safe because each inspection is its own
    // create() call.
    this.pendingDefectLinkage = null;

    // QC Rules engine call removed 2026-09-03 — the rules engine was
    // evaluating enabled rules against the just-submitted inspection
    // and writing triggered actions back to the inspection row. The
    // QC Rules feature was retired and the rules_engine module +
    // qc_rules table + triggered_actions column on inspections are
    // all being removed.

    // Auto-archive the detail submission report. This is best-effort:
    // a PDF generation failure must not fail the submit (the
    // inspection row is the source of truth — we can always
    // re-generate the report on demand from the detail page).
    try {
      await this.reportsService.generateDetailReport(saved.id, {
        kind: 'AUTO_SUBMIT',
        generatedBy: inspectorId,
      });
    } catch (err) {
      this.logger.warn(
        `Auto-archive report generation failed for inspection ${saved.id}: ${(err as Error).message}`,
      );
    }

    return this.getById(saved.id);
  }

  async getById(id: string, caller?: CallerScope): Promise<InspectionEntity> {
    const i = await this.inspectionRepo.findOne({
      where: { id },
      relations: [
        'category',
        'supplier',
        'productCategory',
        'aqlMaster',
        'inspector',
        'inspectorMaster',
        'defects',
        'photos',
      ],
    });
    if (!i) throw new NotFoundException('Inspection not found');
    // Row-level access check: non-admin callers only see rows they
    // submitted. Surface a 403 (not 404) so the UI can show "not
    // yours" rather than "doesn't exist" — admins debugging reports
    // can tell the difference.
    if (caller && !canSeeAllRows(caller)) {
      if (i.inspectorId !== caller.userId) {
        throw new ForbiddenException(
          'You can only view inspections you submitted yourself.',
        );
      }
    }
    return i;
  }

  /**
   * High-volume list with filtering, sorting, paging.
   * Mirrors the FilterCriteria logic from the original WebAdminModels.
   */
  async list(
    q: ListInspectionsQuery,
    caller?: CallerScope,
  ): Promise<{
    data: InspectionEntity[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = q.page ?? 1;
    const pageSize = Math.min(q.pageSize ?? 50, 200);
    const sortBy = q.sortBy ?? 'DATE_DESC';

    const qb = this.inspectionRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.category', 'category')
      .leftJoinAndSelect('i.supplier', 'supplier')
      .leftJoinAndSelect('i.inspector', 'inspector')
      // Extra joins for new columns we might sort or filter by.
      .leftJoinAndSelect('i.productCategory', 'productCategory')
      .leftJoinAndSelect('i.aqlMaster', 'aqlMaster');

    // ─── row scoping ──────────────────────────────────────────────
    // Non-admin callers (and non-super-admin callers) only see rows
    // they themselves submitted. The `inspector_id` column is the
    // `users.id` of the submitter, set in `create()`. We add this
    // WHERE before any user-supplied filter so admins can still
    // narrow down to "submitted by X" via `submittedByUserIds`.
    if (caller && !canSeeAllRows(caller)) {
      qb.andWhere('i.inspector_id = :scopeUserId', {
        scopeUserId: caller.userId,
      });
    }

    if (q.search) {
      qb.andWhere(
        new Brackets((bb) => {
          bb.where('i.po_number ILIKE :s', { s: `%${q.search}%` })
            .orWhere('i.item_number ILIKE :s', { s: `%${q.search}%` })
            .orWhere('i.item_description ILIKE :s', { s: `%${q.search}%` })
            .orWhere('i.inspector_name ILIKE :s', { s: `%${q.search}%` })
            .orWhere('i.merchandiser_name ILIKE :s', { s: `%${q.search}%` });
        }),
      );
    }
    if (q.categoryIds) {
      const ids = q.categoryIds.split(',').filter(Boolean);
      if (ids.length > 0) qb.andWhere('i.category_id IN (:...categoryIds)', { categoryIds: ids });
    }
    if (q.productCategoryIds) {
      const ids = q.productCategoryIds.split(',').filter(Boolean);
      if (ids.length > 0)
        qb.andWhere('i.product_category_id IN (:...productCategoryIds)', {
          productCategoryIds: ids,
        });
    }
    if (q.supplierIds) {
      const ids = q.supplierIds.split(',').filter(Boolean);
      if (ids.length > 0) qb.andWhere('i.supplier_id IN (:...supplierIds)', { supplierIds: ids });
    }
    if (q.inspectionTypes) {
      const ts = q.inspectionTypes.split(',').filter(Boolean);
      if (ts.length > 0)
        qb.andWhere('UPPER(i.inspection_type) IN (:...inspectionTypes)', {
          inspectionTypes: ts.map((t) => t.toUpperCase()),
        });
    }
    if (q.aqlMasterIds) {
      const ids = q.aqlMasterIds.split(',').filter(Boolean);
      if (ids.length > 0)
        qb.andWhere('i.aql_master_id IN (:...aqlMasterIds)', { aqlMasterIds: ids });
    }
    if (q.results) {
      const rs = q.results.split(',').filter(Boolean);
      if (rs.length > 0) qb.andWhere('i.overall_result IN (:...results)', { results: rs });
    }
    if (q.syncStatuses) {
      const ss = q.syncStatuses.split(',').filter(Boolean);
      if (ss.length > 0) qb.andWhere('i.sync_status IN (:...syncStatuses)', { syncStatuses: ss });
    }
    if (q.debitNotes) {
      // Stored as JSONB `{ answer: '' | 'YES' | 'NO' }`. Postgres-side
      // operator avoids round-tripping the JSON into Node and keeps the
      // index usable (debit_note is GIN-indexed in the migrations folder).
      const values = q.debitNotes
        .split(',')
        .map((v) => v.trim().toUpperCase())
        .filter((v) => v === 'YES' || v === 'NO');
      if (values.length > 0)
        qb.andWhere("i.debit_note->>'answer' IN (:...debitNotes)", { debitNotes: values });
    }
    if (q.submittedByUserIds) {
      const ids = q.submittedByUserIds.split(',').filter(Boolean);
      if (ids.length > 0)
        qb.andWhere('i.inspector_id IN (:...submittedByUserIds)', {
          submittedByUserIds: ids,
        });
    }

    // ---- text ILIKE filters ----
    if (q.inspectorName)
      qb.andWhere('i.inspector_name ILIKE :inspectorName', {
        inspectorName: `%${q.inspectorName}%`,
      });
    if (q.merchandiserName)
      qb.andWhere('i.merchandiser_name ILIKE :merchandiserName', {
        merchandiserName: `%${q.merchandiserName}%`,
      });
    if (q.poNumber)
      qb.andWhere('i.po_number ILIKE :poNumber', { poNumber: `%${q.poNumber}%` });
    if (q.designNumber)
      qb.andWhere('i.item_number ILIKE :designNumber', {
        designNumber: `%${q.designNumber}%`,
      });
    if (q.itemDescription)
      qb.andWhere('i.item_description ILIKE :itemDescription', {
        itemDescription: `%${q.itemDescription}%`,
      });

    // ---- numeric ranges ----
    if (q.minCriticalCount !== undefined)
      qb.andWhere('i.total_critical >= :minCriticalCount', {
        minCriticalCount: q.minCriticalCount,
      });
    if (q.minMajorCount !== undefined)
      qb.andWhere('i.total_major >= :minMajorCount', { minMajorCount: q.minMajorCount });
    // `minLotSize` / `maxLotSize` are kept in the DTO for legacy clients but
    // `lot_size` was removed; we silently skip them so the query doesn't 500.
    if (q.minOrderQuantity !== undefined)
      qb.andWhere('i.order_quantity >= :minOrderQuantity', {
        minOrderQuantity: q.minOrderQuantity,
      });
    if (q.maxOrderQuantity !== undefined)
      qb.andWhere('i.order_quantity <= :maxOrderQuantity', {
        maxOrderQuantity: q.maxOrderQuantity,
      });

    // ---- date ranges ----
    // `dateRange` is the legacy submitted-at range (created_at column) —
    // kept for backwards compatibility. `inspectionDateRange` and
    // `deliveryDateRange` reuse the same TODAY/WEEK/MONTH shortcuts but
    // apply to their respective columns.
    if (q.dateRange && q.dateRange !== 'ALL') {
      const since = this.dateRangeSince(q.dateRange);
      if (since) qb.andWhere('i.created_at >= :dateRangeSince', { dateRangeSince: since });
    }
    if (q.inspectionDateRange && q.inspectionDateRange !== 'ALL') {
      const since = this.dateRangeSince(q.inspectionDateRange);
      if (since)
        qb.andWhere('i.inspection_date >= :inspectionDateSince', {
          inspectionDateSince: since,
        });
    }
    if (q.deliveryDateRange && q.deliveryDateRange !== 'ALL') {
      const since = this.dateRangeSince(q.deliveryDateRange);
      if (since)
        qb.andWhere('i.delivery_date >= :deliveryDateSince', {
          deliveryDateSince: since,
        });
    }

    // ---- per-column filters (driven by the grid's column-filter popovers) ----
    // Each entry is `{ columnKey, op, value, value2? }`. We translate to a
    // parametrised andWhere via the column-filter registry. Unknown keys /
    // bad operators are silently dropped by `parseColumnFilters`.
    //
    // Text operators use Postgres ILIKE with `\` as the default escape
    // character; `_` and `%` in user input are escaped so a literal
    // underscore doesn't accidentally match any character.
    const columnFilters: FilterEntry[] = parseColumnFilters(q.filters);
    columnFilters.forEach((f, i) => {
      const rule = getColumnRule(f.columnKey);
      if (!rule) return;
      const alias = `cf_${f.columnKey}_${f.op}_${i}`;
      switch (f.op) {
        case 'contains': {
          const escaped = String(f.value).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
          qb.andWhere(`${rule.sql} ILIKE :${alias} ESCAPE '\\'`, {
            [alias]: `%${escaped}%`,
          });
          break;
        }
        case 'beginsWith': {
          const escaped = String(f.value).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
          qb.andWhere(`${rule.sql} ILIKE :${alias} ESCAPE '\\'`, {
            [alias]: `${escaped}%`,
          });
          break;
        }
        case 'endsWith': {
          const escaped = String(f.value).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
          qb.andWhere(`${rule.sql} ILIKE :${alias} ESCAPE '\\'`, {
            [alias]: `%${escaped}`,
          });
          break;
        }
        case 'isExactly': {
          // Case-insensitive equality. Use `LOWER(...) = LOWER(:alias)` so
          // we don't have to write a CASE branch for every column type.
          qb.andWhere(`LOWER(${rule.sql}) = LOWER(:${alias})`, {
            [alias]: String(f.value),
          });
          break;
        }
        case 'oneOf': {
          // Multi-value OR, case-insensitive. Array form mirrors `in` but
          // only valid on text columns.
          const vals = (f.value as string[]).map((v) => v.toLowerCase());
          qb.andWhere(`LOWER(${rule.sql}) IN (:...${alias})`, { [alias]: vals });
          break;
        }
        case 'match': {
          // Postgres POSIX regex, case-insensitive (~*). Pattern is bound
          // as a parameter so the user can't smuggle a SQL injection.
          qb.andWhere(`${rule.sql} ~* :${alias}`, { [alias]: String(f.value) });
          break;
        }
        case 'eq': {
          qb.andWhere(`${rule.sql} = :${alias}`, { [alias]: f.value });
          break;
        }
        case 'in': {
          // Multi-enum / multi-number: e.g. Result IN (PASS,FAIL)
          qb.andWhere(`${rule.sql} IN (:...${alias})`, { [alias]: f.value as any[] });
          break;
        }
        case 'gte': {
          qb.andWhere(`${rule.sql} >= :${alias}`, { [alias]: f.value });
          break;
        }
        case 'lte': {
          qb.andWhere(`${rule.sql} <= :${alias}`, { [alias]: f.value });
          break;
        }
        case 'between': {
          qb.andWhere(`${rule.sql} BETWEEN :${alias}_lo AND :${alias}_hi`, {
            [`${alias}_lo`]: f.value,
            [`${alias}_hi`]: f.value2,
          });
          break;
        }
      }
    });

    // ---- sorting ----
    // Severity sort uses the same derived total as DEFECTS — order by
    // (critical + major + minor), tie-break on critical then major then
    // minor so two equally-defective lots resolve deterministically.
    const addSeveritySelect = () => {
      qb.addSelect(
        '(i.total_critical + i.total_major + i.total_minor)',
        'i_total_defects',
      );
      qb.addSelect('i.total_critical', 'i_total_critical_sort');
      qb.addSelect('i.total_major', 'i_total_major_sort');
      qb.addSelect('i.total_minor', 'i_total_minor_sort');
    };

    switch (sortBy) {
      case 'DATE_ASC':
        qb.orderBy('i.createdAt', 'ASC');
        break;
      case 'INSPECTION_DATE_DESC':
        qb.orderBy('i.inspectionDate', 'DESC', 'NULLS LAST');
        break;
      case 'INSPECTION_DATE_ASC':
        qb.orderBy('i.inspectionDate', 'ASC', 'NULLS LAST');
        break;
      case 'DELIVERY_DATE_DESC':
        qb.orderBy('i.deliveryDate', 'DESC', 'NULLS LAST');
        break;
      case 'DELIVERY_DATE_ASC':
        qb.orderBy('i.deliveryDate', 'ASC', 'NULLS LAST');
        break;
      case 'PO_ASC':
        qb.orderBy('i.poNumber', 'ASC');
        break;
      case 'PO_DESC':
        qb.orderBy('i.poNumber', 'DESC');
        break;
      case 'DESIGN_ASC':
        qb.orderBy('i.itemNumber', 'ASC');
        break;
      case 'DESIGN_DESC':
        qb.orderBy('i.itemNumber', 'DESC');
        break;
      case 'ITEM_DESC_ASC':
        qb.orderBy('i.itemDescription', 'ASC');
        break;
      case 'ITEM_DESC_DESC':
        qb.orderBy('i.itemDescription', 'DESC');
        break;
      case 'INSPECTOR_NAME_ASC':
        qb.orderBy('i.inspectorName', 'ASC');
        break;
      case 'INSPECTOR_NAME_DESC':
        qb.orderBy('i.inspectorName', 'DESC');
        break;
      case 'MERCHANDISER_NAME_ASC':
        qb.orderBy('i.merchandiserName', 'ASC');
        break;
      case 'MERCHANDISER_NAME_DESC':
        qb.orderBy('i.merchandiserName', 'DESC');
        break;
      case 'TYPE_ASC':
        qb.orderBy('i.inspectionType', 'ASC');
        break;
      case 'TYPE_DESC':
        qb.orderBy('i.inspectionType', 'DESC');
        break;
      case 'CATEGORY_ASC':
        qb.orderBy('category.name', 'ASC');
        break;
      case 'CATEGORY_DESC':
        qb.orderBy('category.name', 'DESC');
        break;
      case 'SUPPLIER_ASC':
        qb.orderBy('supplier.name', 'ASC');
        break;
      case 'SUPPLIER_DESC':
        qb.orderBy('supplier.name', 'DESC');
        break;
      case 'AQL_ASC':
        // AQL master rows store an admin-friendly `description` (e.g.
        // "Lot size 51–90"). Sort by that for human-readable ordering;
        // tie-break on minQty so two rows with the same description
        // (admin-curated bulk inserts) resolve deterministically.
        qb.orderBy('aqlMaster.description', 'ASC', 'NULLS LAST')
          .addOrderBy('aqlMaster.minQty', 'ASC');
        break;
      case 'AQL_DESC':
        qb.orderBy('aqlMaster.description', 'DESC', 'NULLS LAST')
          .addOrderBy('aqlMaster.minQty', 'DESC');
        break;
      case 'INSPECTION_NUMBER_ASC':
        qb.orderBy('i.inspectionNumber', 'ASC', 'NULLS LAST');
        break;
      case 'INSPECTION_NUMBER_DESC':
        qb.orderBy('i.inspectionNumber', 'DESC', 'NULLS LAST');
        break;
      case 'SEVERITY_DESC':
        addSeveritySelect();
        qb.orderBy('i_total_defects', 'DESC')
          .addOrderBy('i_total_critical_sort', 'DESC')
          .addOrderBy('i_total_major_sort', 'DESC')
          .addOrderBy('i_total_minor_sort', 'DESC');
        break;
      case 'SEVERITY_ASC':
        addSeveritySelect();
        qb.orderBy('i_total_defects', 'ASC')
          .addOrderBy('i_total_critical_sort', 'ASC')
          .addOrderBy('i_total_major_sort', 'ASC')
          .addOrderBy('i_total_minor_sort', 'ASC');
        break;
      case 'DEBIT_NOTE_DESC':
        // JSONB sort — map the three possible `debit_note->>'answer'`
        // values to a numeric priority so YES / NO / unanswered order
        // intuitively: YES (3) → NO (2) → '' (1). We register the
        // expression via `addSelect` so TypeORM doesn't try to
        // "auto-combine" the JSONB expression into the SELECT list at
        // execution time (that path crashes with
        // `Cannot read properties of undefined (reading 'databaseName')`
        // because the column-metadata lookup can't map a `->>` operator
        // chain to an entity property).
        qb.addSelect(
          "CASE i.debit_note->>'answer' WHEN 'YES' THEN 3 WHEN 'NO' THEN 2 ELSE 1 END",
          'i_debit_answer_rank',
        );
        qb.orderBy('i_debit_answer_rank', 'DESC');
        break;
      case 'DEBIT_NOTE_ASC':
        qb.addSelect(
          "CASE i.debit_note->>'answer' WHEN 'YES' THEN 3 WHEN 'NO' THEN 2 ELSE 1 END",
          'i_debit_answer_rank',
        );
        qb.orderBy('i_debit_answer_rank', 'ASC');
        break;
      case 'ORDER_QTY_DESC':
        qb.orderBy('i.orderQuantity', 'DESC');
        break;
      case 'ORDER_QTY_ASC':
        qb.orderBy('i.orderQuantity', 'ASC');
        break;
      case 'LOT_DESC':
        // Legacy sort key — lot_size column was removed. Fall back to
        // most-recent so the user's UI keeps working without a 500.
        qb.orderBy('i.createdAt', 'DESC');
        break;
      case 'LOT_ASC':
        qb.orderBy('i.createdAt', 'ASC');
        break;
      case 'DEFECTS_DESC':
        // Order by total defects using a raw SQL expression.
        qb.addSelect(
          '(i.total_critical + i.total_major + i.total_minor)',
          'i_total_defects',
        );
        qb.orderBy('i_total_defects', 'DESC');
        break;
      case 'DEFECTS_ASC':
        qb.addSelect(
          '(i.total_critical + i.total_major + i.total_minor)',
          'i_total_defects',
        );
        qb.orderBy('i_total_defects', 'ASC');
        break;
      case 'CRITICAL_DESC':
        qb.orderBy('i.totalCritical', 'DESC');
        break;
      case 'CRITICAL_ASC':
        qb.orderBy('i.totalCritical', 'ASC');
        break;
      case 'MAJOR_DESC':
        qb.orderBy('i.totalMajor', 'DESC');
        break;
      case 'MAJOR_ASC':
        qb.orderBy('i.totalMajor', 'ASC');
        break;
      case 'DATE_DESC':
      default:
        qb.orderBy('i.createdAt', 'DESC');
    }

    qb.skip((page - 1) * pageSize).take(pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, pageSize };
  }

  /**
   * Optimistic-concurrency check: if the server-side evaluation disagrees
   * with the client's claimed result, surface the correct one back.
   */
  verifyOutcome(i: InspectionEntity): 'PASS' | 'FAIL' {
    return evaluateOutcome({
      totalCritical: i.totalCritical,
      totalMajor: i.totalMajor,
      totalMinor: i.totalMinor,
      aql: {
        codeLetter: i.codeLetter,
        sampleSize: i.sampleSize,
        criticalAc: i.criticalAc,
        criticalRe: i.criticalRe,
        majorAc: i.majorAc,
        majorRe: i.majorRe,
        minorAc: i.minorAc,
        minorRe: i.minorRe,
      },
    });
  }

  async remove(id: string): Promise<void> {
    const i = await this.getById(id);
    await this.inspectionRepo.remove(i);
  }

  async dashboardStats(): Promise<DashboardStats> {
    const total = await this.inspectionRepo.count();
    const totalPassed = await this.inspectionRepo.count({
      where: { overallResult: 'PASS' },
    });
    const totalFailed = await this.inspectionRepo.count({
      where: { overallResult: 'FAIL' },
    });
    const totalRework = await this.inspectionRepo.count({
      where: { overallResult: 'REWORK' },
    });
    const totalHold = await this.inspectionRepo.count({
      where: { overallResult: 'HOLD' },
    });
    const totalRejected = await this.inspectionRepo.count({
      where: { overallResult: 'REJECTED' },
    });
    const totalPendingSync = await this.inspectionRepo.count({
      where: { syncStatus: 'PENDING_SYNC' },
    });
    const passRatePercentage =
      total > 0 ? Math.round((totalPassed / total) * 100) : 0;

    const byCategory = await this.inspectionRepo
      .createQueryBuilder('i')
      .select('c.id', 'categoryId')
      .addSelect('c.name', 'categoryName')
      .addSelect('COUNT(*)', 'count')
      .leftJoin('i.category', 'c')
      .groupBy('c.id')
      .addGroupBy('c.name')
      .orderBy('count', 'DESC')
      .limit(20)
      .getRawMany();

    const bySupplier = await this.inspectionRepo
      .createQueryBuilder('i')
      .select('s.id', 'supplierId')
      .addSelect('s.name', 'supplierName')
      .addSelect('COUNT(*)', 'count')
      .leftJoin('i.supplier', 's')
      .groupBy('s.id')
      .addGroupBy('s.name')
      .orderBy('count', 'DESC')
      .limit(20)
      .getRawMany();

    const recentFailures = await this.inspectionRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.category', 'category')
      .leftJoinAndSelect('i.supplier', 'supplier')
      .where('i.overall_result = :r', { r: 'FAIL' })
      .orderBy('i.created_at', 'DESC')
      .limit(10)
      .getMany();

    // ── B. Supplier leaderboard (vendor performance scorecards) ──
    // Single grouped query: each supplier gets its total count and
    // pass/fail/rework/hold/rejected breakdown in one row. We do the
    // pass-rate calculation in JS so NULL suppliers still surface.
    // Note: TypeORM's addSelect passes column aliases to raw SQL
    // unquoted, which Postgres folds to lowercase. Use snake_case so
    // the keys in `r.<x>` line up after getRawMany().
    const leaderboardRaw = await this.inspectionRepo
      .createQueryBuilder('i')
      .select('s.id', 'supplier_id')
      .addSelect('s.name', 'supplier_name')
      .addSelect('COUNT(*)', 'total')
      .addSelect(`SUM(CASE WHEN i.overall_result = 'PASS'     THEN 1 ELSE 0 END)`, 'passed')
      .addSelect(`SUM(CASE WHEN i.overall_result = 'FAIL'     THEN 1 ELSE 0 END)`, 'failed')
      .addSelect(`SUM(CASE WHEN i.overall_result = 'REWORK'   THEN 1 ELSE 0 END)`, 'rework')
      .addSelect(`SUM(CASE WHEN i.overall_result = 'HOLD'     THEN 1 ELSE 0 END)`, 'hold')
      .addSelect(`SUM(CASE WHEN i.overall_result = 'REJECTED' THEN 1 ELSE 0 END)`, 'rejected')
      .addSelect('MAX(i.created_at)', 'last_inspection_at')
      .leftJoin('i.supplier', 's')
      .groupBy('s.id')
      .addGroupBy('s.name')
      .orderBy('total', 'DESC')
      .limit(20)
      .getRawMany();

    const supplierLeaderboard = leaderboardRaw.map((r) => {
      const totalCount = Number(r.total);
      const passed = Number(r.passed);
      const passRate =
        totalCount > 0 ? Math.round((passed / totalCount) * 100) : 0;
      return {
        supplierId: r.supplier_id,
        supplierName: r.supplier_name ?? '— Unassigned —',
        totalInspections: totalCount,
        totalPassed: passed,
        totalFailed: Number(r.failed),
        totalRework: Number(r.rework),
        totalHold: Number(r.hold),
        totalRejected: Number(r.rejected),
        passRate,
        lastInspectionAt: r.last_inspection_at ? new Date(r.last_inspection_at) : null,
      };
    });

    // ── C. 30-day daily time-series for the workbench ──
    // We bucket by `date_trunc('day', created_at)` so the chart x-axis
    // is continuous. Days with no inspections are emitted as zeros.
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - 29); // 30 days inclusive
    windowStart.setHours(0, 0, 0, 0);

    const dailyRaw = await this.inspectionRepo
      .createQueryBuilder('i')
      .select(`to_char(date_trunc('day', i.created_at), 'YYYY-MM-DD')`, 'date')
      .addSelect('COUNT(*)', 'total')
      .addSelect(`SUM(CASE WHEN i.overall_result = 'PASS'     THEN 1 ELSE 0 END)`, 'passed')
      .addSelect(`SUM(CASE WHEN i.overall_result = 'FAIL'     THEN 1 ELSE 0 END)`, 'failed')
      .addSelect(`SUM(CASE WHEN i.overall_result = 'REWORK'   THEN 1 ELSE 0 END)`, 'rework')
      .addSelect(`SUM(CASE WHEN i.overall_result = 'HOLD'     THEN 1 ELSE 0 END)`, 'hold')
      .addSelect(`SUM(CASE WHEN i.overall_result = 'REJECTED' THEN 1 ELSE 0 END)`, 'rejected')
      .where('i.created_at >= :windowStart', { windowStart })
      .groupBy(`date_trunc('day', i.created_at)`)
      .orderBy(`date_trunc('day', i.created_at)`, 'ASC')
      .getRawMany();

    // Index by date so we can back-fill missing days.
    const dailyByDate = new Map<string, (typeof dailyRaw)[number]>();
    for (const row of dailyRaw) dailyByDate.set(row.date, row);

    const inspectionsByDay: DashboardStats['inspectionsByDay'] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(windowStart);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const row = dailyByDate.get(key);
      inspectionsByDay.push({
        date: key,
        total: row ? Number(row.total) : 0,
        passed: row ? Number(row.passed) : 0,
        failed: row ? Number(row.failed) : 0,
        rework: row ? Number(row.rework) : 0,
        hold: row ? Number(row.hold) : 0,
        rejected: row ? Number(row.rejected) : 0,
      });
    }

    // ── C. Defect severity totals + Pareto keyword extraction ──
    const totalCritical = (await this.inspectionRepo.sum('totalCritical')) ?? 0;
    const totalMajor = (await this.inspectionRepo.sum('totalMajor')) ?? 0;
    const totalMinor = (await this.inspectionRepo.sum('totalMinor')) ?? 0;
    const totalDefects = totalCritical + totalMajor + totalMinor;

    // Top defect keywords — pulled from the `defect_items` table via the
    // relation. We pick the 800 most recent defects and bucket by
    // lower-cased keyword.
    const recentDefectsRaw = await this.inspectionRepo
      .createQueryBuilder('i')
      .leftJoin('i.defects', 'd')
      .select('d.description', 'description')
      .addSelect('d.quantity', 'quantity')
      .orderBy('i.created_at', 'DESC')
      .limit(800)
      .getRawMany();

    const keywordCounts = new Map<string, number>();
    const stopwords = new Set([
      'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'is', 'was',
      'with', 'to', 'for', 'be', 'as', 'by', 'this', 'that', 'it',
      'cm', 'mm', 'unit', 'units', 'left', 'right', 'side',
      'minor', 'major', 'critical',
    ]);
    for (const row of recentDefectsRaw) {
      const desc = (row.description ?? '').toLowerCase();
      const qty = Number(row.quantity ?? 1) || 1;
      const words = desc
        .replace(/[^a-z0-9\s/-]/g, ' ')
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 4 && !stopwords.has(w));
      // Boost bi-grams when both halves are real words.
      for (let w = 0; w < words.length; w++) {
        const a = words[w];
        const b = words[w + 1];
        if (a) keywordCounts.set(a, (keywordCounts.get(a) ?? 0) + qty);
        if (a && b) {
          const bg = `${a} ${b}`;
          keywordCounts.set(bg, (keywordCounts.get(bg) ?? 0) + qty);
        }
      }
    }
    const topDefectTypes = [...keywordCounts.entries()]
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // ── C. Inspector productivity (per-inspector counters) ──
    const inspectorRaw = await this.inspectionRepo
      .createQueryBuilder('i')
      .select('u.id', 'inspector_id')
      .addSelect(`COALESCE(u.full_name, i.inspector_name, '—')`, 'inspector_name')
      .addSelect('COUNT(*)', 'total_inspections')
      .addSelect(`SUM(CASE WHEN i.overall_result = 'PASS' THEN 1 ELSE 0 END)`, 'passed')
      .addSelect('MAX(i.created_at)', 'last_activity_at')
      .leftJoin('i.inspector', 'u')
      .groupBy('u.id')
      .addGroupBy('u.full_name')
      .addGroupBy('i.inspector_name')
      .orderBy('total_inspections', 'DESC')
      .limit(10)
      .getRawMany();

    const inspectorProductivity = inspectorRaw.map((r) => {
      const totalI = Number(r.total_inspections);
      const passed = Number(r.passed);
      return {
        inspectorId: r.inspector_id ?? '',
        inspectorName: r.inspector_name ?? '— Unassigned —',
        totalInspections: totalI,
        passed,
        passRate: totalI > 0 ? Math.round((passed / totalI) * 100) : 0,
        lastActivityAt: r.last_activity_at ? new Date(r.last_activity_at) : null,
      };
    });

    return {
      totalInspections: total,
      totalPassed,
      totalFailed,
      totalRework,
      totalHold,
      totalRejected,
      totalPendingSync,
      passRatePercentage,
      inspectionsByCategory: byCategory.map((r) => ({
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        count: Number(r.count),
      })),
      inspectionsBySupplier: bySupplier.map((r) => ({
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        count: Number(r.count),
      })),
      recentFailures: recentFailures.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        category: r.category?.name ?? '',
        supplier: r.supplier?.name ?? '',
        totalCritical: r.totalCritical,
        totalMajor: r.totalMajor,
      })),
      supplierLeaderboard,
      inspectionsByDay,
      defectTallies: {
        totalCritical,
        totalMajor,
        totalMinor,
        totalDefects,
      },
      topDefectTypes,
      inspectorProductivity,
      snapshotGeneratedAt: now,
      snapshotFrom: windowStart,
    };
  }

  private dateRangeSince(option: string): Date | null {
    const now = new Date();
    if (option === 'TODAY') {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    if (option === 'WEEK') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    if (option === 'MONTH') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d;
    }
    return null;
  }

  /**
   * Compute the next Inspection Document Number for the given day, in
   * the format `QC-YYMMDD-NNNN`. We count how many rows were persisted
   * on that day and use `count + 1` as the next sequence — this is
   * safe because the column has a UNIQUE constraint, so a duplicate
   * surfaces as a 409 at the controller boundary and the user can
   * retry (the next call's `count` will have moved on).
   */
  private async nextInspectionNumber(now: Date): Promise<string> {
    const yymmdd = this.formatYymmdd(now);
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const todaysCount = await this.inspectionRepo
      .createQueryBuilder('i')
      .where('i.created_at >= :dayStart AND i.created_at < :dayEnd', {
        dayStart,
        dayEnd,
      })
      .getCount();
    const seq = (todaysCount + 1).toString().padStart(4, '0');
    return `QC-${yymmdd}-${seq}`;
  }

  private formatYymmdd(d: Date): string {
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
  }
}
