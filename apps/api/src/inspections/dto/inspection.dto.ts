import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

import type {
  EvaluationCheckAnswer,
  EvaluationCheckKey,
  DebitNoteAnswer,
  SignatureRole,
} from '../../database/entities/inspection.entity';

/**
 * Reject numbers that have more decimal places than `max`.
 * Used to enforce the UI's `step={0.01}` rule on the API side so a
 * malicious or buggy client can't smuggle e.g. 1.2345 into a NUMERIC(14,2) column.
 */
function MaxDecimalPlaces(max: number, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'MaxDecimalPlaces',
      target: object.constructor,
      propertyName,
      constraints: [max],
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === null || value === undefined) return true;
          if (typeof value !== 'number' || !Number.isFinite(value)) return false;
          // 2 dp is allowed for max=2 (0.01, 0.10, 0.1 all OK).
          const factor = Math.pow(10, max);
          return Math.round(value * factor) === value * factor;
        },
        defaultMessage() {
          return `${propertyName} may have at most ${max} decimal places`;
        },
      },
    });
  };
}

/**
 * Cross-field cap: this property must be ≤ the value of `otherField`.
 *
 * Used for the carton counters: `inspectedCartons` cannot exceed
 * `totalCartons`. If `otherField` is missing or not a number the rule is
 * skipped — the missing-field check on `otherField` handles that case.
 */
function MaxRelativeTo(
  otherField: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'MaxRelativeTo',
      target: object.constructor,
      propertyName,
      constraints: [otherField],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: any) {
          if (value === null || value === undefined) return true;
          if (typeof value !== 'number' || !Number.isFinite(value)) return false;
          const obj = args.object as Record<string, unknown>;
          const other = obj[otherField];
          if (other === null || other === undefined) return true;
          if (typeof other !== 'number' || !Number.isFinite(other)) return true;
          return value <= other;
        },
        defaultMessage(args: any) {
          const obj = args.object as Record<string, unknown>;
          const other = obj[otherField];
          return `${args.property} (${args.value}) must be ≤ ${args.constraints[0]} (${other})`;
        },
      },
    });
  };
}

export class DefectInput {
  @IsIn(['CRITICAL', 'MAJOR', 'MINOR'])
  severity!: 'CRITICAL' | 'MAJOR' | 'MINOR';

  @IsString()
  @MinLength(2)
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class PhotoInput {
  @IsString()
  url!: string;

  @IsOptional() @IsString()
  thumbnailUrl?: string;

  @IsOptional() @IsString()
  mimeType?: string;

  @IsOptional() @IsInt()
  size?: number;

  @IsOptional() @IsInt()
  width?: number;

  @IsOptional() @IsInt()
  height?: number;

  @IsOptional() @IsString()
  caption?: string;

  /**
   * Severity the photo documents. Only meaningful for `DEFECT_MAJOR`
   * and `DEFECT_MINOR` photo kinds — left empty for the carton /
   * evaluation / debit-note photos. The PDF report groups defect
   * photos by severity so the Major and Minor evidence can be shown
   * side by side.
   */
  @IsOptional()
  @IsIn(['MAJOR', 'MINOR'])
  severity?: 'MAJOR' | 'MINOR';

  /**
   * Optional FK to the specific defect row this photo documents.
   * Only meaningful for `DEFECT_*` photo kinds — left NULL for
   * everything else. The server back-fills this from the matching
   * defect entry on the `defects` array if the client omits it.
   */
  @IsOptional()
  @IsUUID()
  defectId?: string;

  /**
   * Photo purpose. Defaults to 'INSPECTION' if omitted (legacy behaviour).
   * New Step 7 fields emit 'CARTON_UPLOAD' or 'CARTON_INSPECT'.
   * New Step 6 "Evaluation checks" photos emit 'EVAL_<KEY>' (e.g.
   * 'EVAL_INLINE_INSPECTION_DONE') so the existing `photos` table is the
   * single binary store and we never duplicate the bytes. New Step 8
   * "Defects captured" photos emit 'DEFECT_MAJOR' or 'DEFECT_MINOR' so
   * per-defect evidence is grouped on the PDF report by severity.
   */
  @IsOptional()
  @IsIn([
    'INSPECTION',
    'CARTON_UPLOAD',
    'CARTON_INSPECT',
    'EVAL_INLINE_INSPECTION_DONE',
    'EVAL_PP_SAMPLE_APPROVED',
    'EVAL_IC_AVAILABLE',
    'EVAL_BARCODE',
    'EVAL_CARE_LABEL',
    'EVAL_PACKING_LIST_AVAILABLE',
    'EVAL_PO_SAME',
    'EVAL_ATTACH_MEASUREMENT_SHEET',
    'EVAL_STORAGE_OK',
    'EVAL_TEST_REPORT_AVAILABLE',
    'EVAL_DEBIT_NOTE',
    'DEFECT_MAJOR',
    'DEFECT_MINOR',
  ])
  kind?:
    | 'INSPECTION'
    | 'CARTON_UPLOAD'
    | 'CARTON_INSPECT'
    | 'EVAL_INLINE_INSPECTION_DONE'
    | 'EVAL_PP_SAMPLE_APPROVED'
    | 'EVAL_IC_AVAILABLE'
    | 'EVAL_BARCODE'
    | 'EVAL_CARE_LABEL'
    | 'EVAL_PACKING_LIST_AVAILABLE'
    | 'EVAL_PO_SAME'
    | 'EVAL_ATTACH_MEASUREMENT_SHEET'
    | 'EVAL_STORAGE_OK'
    | 'EVAL_TEST_REPORT_AVAILABLE'
    | 'EVAL_DEBIT_NOTE'
    | 'DEFECT_MAJOR'
    | 'DEFECT_MINOR';
}

/**
 * Step 6 of the New Inspection form — one of five fixed readiness checks
 * (Inline Inspection Done / PP Sample Approved / IC Available / Barcode /
 * Care Label). Each entry must have a YES/NO answer; YES answers must
 * carry at least one photo URL (the form enforces this before submit, but
 * the API re-validates so a misbehaving client can't slip through).
 */
export class EvaluationCheckInput {
  @IsIn([
    'INLINE_INSPECTION_DONE',
    'PP_SAMPLE_APPROVED',
    'IC_AVAILABLE',
    'BARCODE',
    'CARE_LABEL',
    'PACKING_LIST_AVAILABLE',
    'PO_SAME',
    'ATTACH_MEASUREMENT_SHEET',
    'STORAGE_OK',
    'TEST_REPORT_AVAILABLE',
  ])
  key!: EvaluationCheckKey;

  @IsString()
  @MaxLength(128)
  label!: string;

  @IsIn(['YES', 'NO'])
  answer!: EvaluationCheckAnswer;

  @IsOptional() @IsInt() @Min(0)
  photoCount?: number;

  @IsOptional() @IsArray() @IsString({ each: true })
  photoUrls?: string[];
}

/**
 * Step 8 debit-note payload. `answer` is the yes/no choice (empty
 * string until the inspector picks one); `comment` is mandatory when
 * the answer is Yes — the form-level validation surfaces that to the
 * user, but we also validate here so a stale or hand-rolled client
 * can't slip an empty comment through. When `answer === 'YES'` the
 * inspector must also attach at least one supporting photo, which the
 * form mirrors on the `EvalPhotoButton`; the API enforces that as a
 * cross-field rule below so the JSONB snapshot is consistent with
 * the binary store.
 */
export class DebitNoteInput {
  @IsIn(['', 'YES', 'NO'])
  answer!: DebitNoteAnswer;

  @IsOptional() @IsString() @MaxLength(2000)
  comment?: string;

  @IsOptional() @IsInt() @Min(0)
  photoCount?: number;

  @IsOptional() @IsArray() @IsString({ each: true })
  photoUrls?: string[];
}

/**
 * One signature block on the New Inspection form (Step 10). The form
 * sends an entry for every stakeholder who has to sign off on the
 * lot — QC Inspector, Supplier, AQM, Merchandiser — even if some are
 * still blank; the service normalises the array and drops empty
 * `dataUrl`s before persisting. The `signedAt` ISO timestamp is
 * filled by the form at the moment the user releases the pointer,
 * so the report / detail page can show when each signature was
 * captured.
 */
export class SignatureInput {
  @IsIn(['QC_INSPECTOR', 'SUPPLIER', 'AQM', 'MERCHANDISER'])
  role!: SignatureRole;

  @IsString() @MaxLength(64)
  label!: string;

  @IsOptional() @IsString() @MaxLength(200_000)
  dataUrl?: string;

  @IsOptional() @IsString() @MaxLength(40)
  signedAt?: string;
}

export class CreateInspectionDto {
  @IsUUID()
  submissionUuid!: string;

  /**
   * Human-readable Inspection Document Number (e.g. `QC-260830-0001`).
   * Optional — the service auto-assigns one from the per-day counter
   * if the client doesn't supply a value (typical case for mobile /
   * web forms). The form can override to keep its own numbering scheme
   * but the column is unique, so collisions will fail the insert.
   */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  inspectionNumber?: string;

  /**
   * Step 8 "Debit note" — inspector raises a debit note against the  /**
   * Step 8 "Debit note" — inspector raises a debit note against the
   * supplier when the lot has a quality / commercial issue. The form
   * persists `{ answer: 'YES' | 'NO' | '', comment: string }` so the
   * report / detail page can render the yes/no badge and the reason
   * side by side. `comment` is required when `answer === 'YES'`, which
   * the form enforces before submit; the API re-checks so a
   * misbehaving client can't bypass it.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => DebitNoteInput)
  debitNoteSnapshot?: DebitNoteInput;

  @IsOptional() @IsUUID()
  categoryId?: string | null;

  @IsUUID()
  productCategoryId!: string;

  @IsUUID()
  merchandiserId!: string;

  @IsUUID()
  supplierId!: string;

  @IsOptional() @IsUUID()
  inspectorMasterId?: string;

  @IsOptional() @IsBoolean()
  isCustomSupplier?: boolean;

  @IsOptional() @IsString()
  customSupplierName?: string;

  @IsOptional() @IsString()
  poNumber?: string;

  @IsOptional() @IsString()
  itemNumber?: string;

  @IsOptional() @IsString()
  itemDescription?: string;

  @IsOptional() @IsString()
  @MaxLength(128)
  color?: string;

  @IsOptional()
  @IsString()
  inspectionDate?: string;

  @IsOptional()
  @IsString()
  deliveryDate?: string;

  @IsNumber()
  @Min(0)
  @MaxDecimalPlaces(2)
  orderQuantity!: number;

  @IsNumber()
  @Min(0)
  @MaxDecimalPlaces(2)
  presentedQuantity!: number;

  @IsNumber()
  @Min(0)
  @MaxDecimalPlaces(2)
  inspectedQuantity!: number;

  // Carton-level counters — integer-only (no decimals). Step 7 on the form.
  @IsInt()
  @Min(0)
  totalCartons!: number;

  // Inspected cartons can never exceed total cartons — a UX rule that the
  // form also enforces live, plus the API as the source of truth.
  @IsInt()
  @Min(0)
  @MaxRelativeTo('totalCartons', {
    message: 'inspectedCartons must be ≤ totalCartons',
  })
  inspectedCartons!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fabricQuality!: string;

  // Free-form code matched against the inspection_types master in the service.
  // We deliberately drop the old INLINE/FINAL IsIn so admins can introduce
  // their own codes (e.g. DUPRO, PRE-SHIPMENT) without code changes.
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  inspectionType!: string;

  // Reference to the AQL master row that drives the sampling plan.
  // Replaces the previous lot_size / inspection_level / aql_limit_* fields.
  @IsUUID()
  aqlMasterId!: string;

  @IsString()
  codeLetter!: string;

  @IsInt() @Min(0)
  sampleSize!: number;

  @IsInt() criticalAc!: number;
  @IsInt() criticalRe!: number;
  @IsInt() majorAc!: number;
  @IsInt() majorRe!: number;
  @IsInt() minorAc!: number;
  @IsInt() minorRe!: number;

  @IsInt() @Min(0)
  totalCritical!: number;

  @IsInt() @Min(0)
  totalMajor!: number;

  @IsInt() @Min(0)
  totalMinor!: number;

  @IsOptional() @IsIn(['PASS', 'FAIL', 'PENDING_REVIEW', 'REWORK', 'HOLD', 'COMMERCIAL_APPROVED', 'REJECTED'])
  overallResult?: 'PASS' | 'FAIL' | 'PENDING_REVIEW' | 'REWORK' | 'HOLD' | 'COMMERCIAL_APPROVED' | 'REJECTED';

  @IsOptional() @IsString()
  inspectorName?: string;

  @IsOptional() @IsString()
  inspectorNotes?: string;

  @IsOptional() @IsString()
  signatureBase64?: string;

  /**
   * Step 10 "Signatures" — e-signature captures from every stakeholder
   * who has to authorise the lot. The form sends one entry per role
   * (QC Inspector / Supplier / AQM / Merchandiser); the service drops
   * entries whose `dataUrl` is empty before persisting. Optional on
   * the wire so older clients that still send only the legacy
   * `signatureBase64` keep working.
   */
  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SignatureInput)
  signatures?: SignatureInput[];

  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DefectInput)
  defects?: DefectInput[];

  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhotoInput)
  photos?: PhotoInput[];

  /**
   * Step 6 "Evaluation checks" answers. Optional because INLINE inspections
   * skip the card entirely on the form; non-INLINE always sends the array
   * (possibly empty) so the API can persist the inspector's selections.
   */
  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluationCheckInput)
  evaluationChecks?: EvaluationCheckInput[];
}

export class ListInspectionsQuery {
  @IsOptional() @IsString()
  search?: string;

  // ---- multi-select filters (comma-separated UUID / value lists) ----
  @IsOptional() @IsString()
  categoryIds?: string;

  @IsOptional() @IsString()
  productCategoryIds?: string;

  @IsOptional() @IsString()
  supplierIds?: string;

  @IsOptional() @IsString()
  inspectionTypes?: string;

  @IsOptional() @IsString()
  aqlMasterIds?: string;

  @IsOptional() @IsString()
  results?: string;

  @IsOptional() @IsString()
  syncStatuses?: string;

  /** YES / NO / '' (all) — kept as comma-separated for future extensibility. */
  @IsOptional() @IsString()
  debitNotes?: string;

  /** Subset of UserEntity IDs that submitted the inspection (the
   *  `inspector` join — NOT the dedicated Inspector master). */
  @IsOptional() @IsString()
  submittedByUserIds?: string;

  // ---- text filters ----
  @IsOptional() @IsString()
  inspectorName?: string;

  @IsOptional() @IsString()
  merchandiserName?: string;

  @IsOptional() @IsString()
  poNumber?: string;

  /** Design number is the form-side name for `item_number` in some
   *  shops — surfaced as a separate filter so admin can find by it
   *  without having to remember which column it lives in. */
  @IsOptional() @IsString()
  designNumber?: string;

  @IsOptional() @IsString()
  itemDescription?: string;

  // ---- numeric ranges ----
  @IsOptional() @IsInt() minCriticalCount?: number;
  @IsOptional() @IsInt() minMajorCount?: number;
  @IsOptional() @IsInt() minLotSize?: number;
  @IsOptional() @IsInt() maxLotSize?: number;
  @IsOptional() @IsInt() minOrderQuantity?: number;
  @IsOptional() @IsInt() maxOrderQuantity?: number;

  // ---- date filters ----
  // `dateRange` is the legacy "submitted-at" range (created_at) — kept
  // for backwards compatibility. `inspectionDateRange` and
  // `deliveryDateRange` reuse the same enum (ALL / TODAY / WEEK / MONTH
  // / plus optional explicit ISO bounds).
  @IsOptional() @IsIn(['ALL', 'TODAY', 'WEEK', 'MONTH'])
  dateRange?: string;

  @IsOptional() @IsIn(['ALL', 'TODAY', 'WEEK', 'MONTH'])
  inspectionDateRange?: string;

  @IsOptional() @IsIn(['ALL', 'TODAY', 'WEEK', 'MONTH'])
  deliveryDateRange?: string;

  // ---- sorting ----
  // The sortBy enum is intentionally large — the UI's column-header
  // sort + the global "Sort by" dropdown both pipe through this same
  // list so the server is the single source of truth for sortability.
  @IsOptional() @IsIn([
    // date / status
    'DATE_DESC',
    'DATE_ASC',
    'INSPECTION_DATE_DESC',
    'INSPECTION_DATE_ASC',
    'DELIVERY_DATE_DESC',
    'DELIVERY_DATE_ASC',
    // text fields
    'PO_ASC',
    'PO_DESC',
    'DESIGN_ASC',
    'DESIGN_DESC',
    'ITEM_DESC_ASC',
    'ITEM_DESC_DESC',
    'INSPECTOR_NAME_ASC',
    'INSPECTOR_NAME_DESC',
    'MERCHANDISER_NAME_ASC',
    'MERCHANDISER_NAME_DESC',
    'TYPE_ASC',
    'TYPE_DESC',
    'CATEGORY_ASC',
    'CATEGORY_DESC',
    'SUPPLIER_ASC',
    'SUPPLIER_DESC',
    'AQL_ASC',
    'AQL_DESC',
    'INSPECTION_NUMBER_ASC',
    'INSPECTION_NUMBER_DESC',
    'SEVERITY_DESC',
    'SEVERITY_ASC',
    'DEBIT_NOTE_DESC',
    'DEBIT_NOTE_ASC',
    // numeric
    'ORDER_QTY_DESC',
    'ORDER_QTY_ASC',
    'LOT_DESC',
    'LOT_ASC',
    'DEFECTS_DESC',
    'DEFECTS_ASC',
    'CRITICAL_DESC',
    'CRITICAL_ASC',
    'MAJOR_DESC',
    'MAJOR_ASC',
  ])
  sortBy?: string;

  @IsOptional() @IsInt() @Min(1)
  page?: number;

  @IsOptional() @IsInt() @Min(1)
  pageSize?: number;

  /**
   * Per-column filters keyed by column key (e.g. `po`, `result`,
   * `inspectionDate`, `inspectionNumber`). Each entry has the shape
   *
   *   { columnKey,
   *     op: 'contains' | 'beginsWith' | 'endsWith' | 'isExactly'
   *       | 'oneOf' | 'match'      // text columns
   *       | 'eq' | 'in'             // enum / numeric
   *       | 'gte' | 'lte' | 'between',
   *     value: string | number | string[] | number[],
   *     value2?: number | string }
   *
   * Sent as a URL-encoded JSON string (e.g. `?filters=%5B%7B…%7D%5D`).
   * The service validates each entry against the column registry —
   * unknown column keys and bad operators are silently dropped so the
   * UI can introduce new column types without breaking old clients.
   */
  @IsOptional() @IsString()
  filters?: string;
}

export class DashboardStats {
  totalInspections!: number;
  totalPassed!: number;
  totalFailed!: number;
  totalRework!: number;
  totalHold!: number;
  totalCommercialApproved!: number;
  totalRejected!: number;
  totalPendingSync!: number;
  passRatePercentage!: number;
  inspectionsByCategory!: { categoryId: string; categoryName: string; count: number }[];
  inspectionsBySupplier!: { supplierId: string; supplierName: string; count: number }[];
  recentFailures!: { id: string; createdAt: Date; category: string; supplier: string; totalCritical: number; totalMajor: number }[];

  // ── Vendor / supplier performance (B. Vendor Performance page) ─────────
  // Each supplier gets a one-row scorecard so admins can see who's
  // delivering and who's slipping.
  supplierLeaderboard!: {
    supplierId: string;
    supplierName: string;
    totalInspections: number;
    totalPassed: number;
    totalFailed: number;
    totalRework: number;
    totalHold: number;
    totalCommercialApproved: number;
    totalRejected: number;
    passRate: number; // 0–100, integer, % of decided inspections that passed
    lastInspectionAt: Date | null;
  }[];

  // ── Business analysis workbench (C. Business Analytics) ─────────────────
  // 30-day daily time-series so the workbench can draw a trend line. The
  // server buckets by day in local server time (UTC for now) and emits
  // one entry per day in the window, including zero-count days so the
  // chart x-axis is continuous.
  inspectionsByDay!: {
    date: string; // ISO yyyy-mm-dd
    total: number;
    passed: number;
    failed: number;
    rework: number;
    hold: number;
    commercialApproved: number;
    rejected: number;
  }[];

  // Defect severity totals — single source of truth that feeds the
  // Pareto chart in the workbench.
  defectTallies!: { totalCritical: number; totalMajor: number; totalMinor: number; totalDefects: number };

  // Top defect types/keywords across the population — useful for
  // surfacing recurring issues. Uses `defects.description` aggregated
  // by lower-cased substring, capped at top 8.
  topDefectTypes!: { keyword: string; count: number }[];

  // Inspector productivity — total inspections logged + pass rate per
  // inspector in the chosen window (all-time).
  inspectorProductivity!: {
    inspectorId: string;
    inspectorName: string;
    totalInspections: number;
    passed: number;
    passRate: number;
    lastActivityAt: Date | null;
  }[];

  // Period timestamps so the dashboard can show its own snapshot
  // boundaries (`snapshotFrom` may be null for "all-time").
  snapshotGeneratedAt!: Date;
  snapshotFrom!: Date | null;
}
