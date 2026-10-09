"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clientApiFetch } from "@/lib/api-client";

interface Category {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  aqlSetup?: any;
}
interface ProductCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  merchandisers: Merchandiser[];
}
interface Merchandiser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}
interface Supplier {
  id: string;
  vendorId: string | null;
  name: string;
}
interface Inspector {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}
interface InspectionType {
  id: string;
  code: string;
  label: string;
  isActive: boolean;
}

interface AqlMaster {
  id: string;
  minQty: number;
  maxQty: number;
  sampleSize: number;
  description: string;
  isActive: boolean;
}

type Defect = {
  // Severity is per-defect only — Major and Minor. Critical defects are
  // tracked at the lot level (reject the whole lot / quarantine via the
  // rule engine), not as a per-defect row in the inspector's tally.
  severity: "MAJOR" | "MINOR";
  description: string;
  quantity: number;
  /**
   * Photos documenting this defect. At least one photo is MANDATORY
   * before the inspector can click "Add" on the defect row — multiple
   * photos are allowed per defect. On submit the form flattens these
   * into the inspection's `photos[]` array with `kind: 'DEFECT_MAJOR'`
   * or `'DEFECT_MINOR'` and `severity` mirroring the defect's severity.
   * The backend then links each photo to its defect row via `defectId`
   * (paired by per-severity queue order, so Major photos link to the
   * first Major defect, second Major defect, etc.).
   */
  photos: UploadedPhoto[];
};

const DEFECT_PRESETS: Record<Defect["severity"], string[]> = {
  MAJOR: [
    "Stitching defect",
    "Wrong color shade",
    "Surface scratch",
    "Functional defect (non-safety)",
    "Misaligned component",
  ],
  MINOR: [
    "Cosmetic blemish",
    "Loose thread",
    "Slight discoloration",
    "Packaging dent",
    "Label misprint",
  ],
};

/**
 * Strict quantity-input filter.
 *
 * Returns `true` when `raw` is a valid quantity string the user is allowed to
 * see in the input: non-negative, digits + at most one decimal point,
 * at most 2 digits after the decimal point.
 *
 * Why this lives at the *string* level (not as a number-coercion helper):
 *   `<input type="number">` happily accepts garbage like "1-11", "abc", or
 *   scientific notation, and React does not echo an empty `.value` back from
 *   `state` when the parsed number is NaN. By switching the inputs to
 *   `type="text"` + `inputMode="decimal"` and gating `onChange` through
 *   `isValidQty`, the input field literally cannot display anything other
 *   than a clean non-negative decimal with up to 2 fractional digits.
 */
function isValidQty(raw: string): boolean {
  if (raw === "" || raw == null) return true; // empty allowed (user is clearing)
  return /^(\d+)(\.\d{0,2})?$/.test(raw);
}

/** Coerce a valid qty string to a number for state / payload use. */
function qtyToNumber(raw: string): number {
  if (raw === "" || raw == null) return NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

/** Coerce an integer-style string (no decimals) to a number for payload use. */
function intStringToNumber(raw: string): number {
  if (raw === "" || raw == null) return NaN;
  if (!/^\d+$/.test(raw)) return NaN;
  return Number(raw);
}

/**
 * Convert empty / whitespace / sentinel values to `undefined` so the submit
 * payload NEVER carries an empty string into an optional field.
 *
 * Why this helper exists (root-cause of the `categoryId must be a UUID` 400):
 *
 *   NestJS's `class-validator` `@IsOptional()` only skips subsequent
 *   validators when the value is `null` OR `undefined`. An empty string
 *   `""` is treated as a present-but-invalid value, so the next decorator
 *   (e.g. `@IsUUID()`) still runs and rejects the payload with HTTP 400.
 *
 *   React controlled `<input>`s default to `""` for "nothing typed yet",
 *   which JSON-serialises to `""` not `null`. Without this normalisation
 *   every optional field in the form payload risks triggering the same
 *   validation error. Using `?? undefined` instead of `|| undefined` would
 *   also work for strings (falsy covers `''`), but this helper centralises
 *   the rule so a future "treat `0` as missing too" change is a one-line
 *   patch and reviewers see the intent at every call site.
 *
 * Treats these as "missing" and returns `undefined`:
 *   - `''` (empty string — the React/HTML default for an empty input)
 *   - `'   '` (whitespace-only — the user "cleared" the field)
 *   - `null`
 *   - `undefined`
 *   - `NaN` (numeric fields whose string parse failed)
 *
 * Anything else (including `0` and `false`) is passed through verbatim.
 */
function optional<T>(v: T): T | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string") {
    return v.trim() === "" ? undefined : (v as unknown as T);
  }
  if (typeof v === "number" && Number.isNaN(v)) return undefined;
  return v;
}

/** Per-photo local state shape (after upload). */
type UploadedPhoto = {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
};

import type { UiLayout } from "@/lib/uiLayout";

/**
 * Step 10 of the New Inspection form ("Signatures") — every
 * stakeholder who has to authorise the lot signs their own
 * e-signature on a dedicated canvas. The four roles are declared
 * up-front so the StepCard renders the same blocks in the same
 * order on every load, and so the API's `signatures` JSONB column
 * always contains a known set of roles. Re-ordering the array is
 * safe; the API normalises by `role` not by index.
 *
 * `label` is the human-readable role name shown above each
 * canvas. The API stores it verbatim on the persisted
 * `SignatureSnapshot` row so the report / detail page can render
 * the same caption next to each signature.
 */
type SignatureRole = "QC_INSPECTOR" | "SUPPLIER" | "AQM" | "MERCHANDISER";
type SignatureRecord = Record<SignatureRole, string>;
const SIGNATURE_ROLES: { role: SignatureRole; label: string }[] = [
  { role: "QC_INSPECTOR", label: "QC Inspector Signature" },
  { role: "SUPPLIER", label: "Supplier Signature" },
  { role: "AQM", label: "AQM Signature" },
  { role: "MERCHANDISER", label: "Merchandiser Signature" },
];

export default function NewInspectionForm({
  categories,
  aqlMaster,
  productCategories,
  suppliers,
  inspectors,
  inspectionTypes,
  layout = "modern",
}: {
  categories: Category[];
  aqlMaster: AqlMaster[];
  productCategories: ProductCategory[];
  suppliers: Supplier[];
  inspectors: Inspector[];
  inspectionTypes: InspectionType[];
  layout?: UiLayout;
}) {
  const router = useRouter();
  const isClassic = layout === "classic";

  // No silent default — the user must explicitly pick an inspection type
  // AND a product category. Empty string is the "not chosen" sentinel;
  // canSubmit gates on both.
  const [draft, setDraft] = useState({
    poNumber: "",
    itemNumber: "",
    itemDescription: "",
    color: "",
    // legacy AQL-bearing category master — still required
    categoryId: categories[0]?.id ?? "",
    aqlMasterId: "" as string, // Step 7 — user picks a sampling plan row from AQL master
    // new lightweight "what kind of product" master (chip picker)
    productCategoryId: "" as string,
    merchandiserId: "" as string,
    supplierId: "", // user must choose — Step 3 is required
    inspectionType: "", // user must choose — required field
    inspectorMasterId: "", // Step 4 — user picks from the Inspector master
    inspectionDate: new Date().toISOString().slice(0, 10), // today, YYYY-MM-DD
    deliveryDate: "",
    orderQuantity: "",
    presentedQuantity: "",
    inspectedQuantity: "",
    fabricQuality: "",
    inspectorNotes: "",
    // Step 7 carton-level fields (integer-only).
    totalCartons: "",
    inspectedCartons: "",
    totalCritical: 0,
    totalMajor: 0,
    totalMinor: 0,
    // Inspector-chosen overall verdict. Mandatory — the user must
    // explicitly choose Pass / Fail / Rework. Empty string means "not
    // picked yet" (form starts blank on purpose so the choice is
    // deliberate, not the default).
    inspectionStatus: "" as
      | ""
      | "PASS"
      | "FAIL"
      | "REWORK"
      | "HOLD"
      | "COMMERCIAL_APPROVED"
      | "REJECTED",
    // Step 8 Debit note — yes/no + free-text comment. The form keeps
    // both blank until the inspector picks Yes or No so the snapshot
    // we send to the API never carries a comment without a deliberate
    // "Yes" answer.
    debitNote: "" as "" | "YES" | "NO",
    debitNoteComment: "",
    // Step 10 Signatures — one PNG data URL per signing stakeholder.
    // The form declares the four roles up-front (see SIGNATURE_ROLES)
    // so the StepCard always renders the same four blocks in the same
    // order; an empty string means "not signed yet". All four must be
    // non-empty before submit.
    signatures: {
      QC_INSPECTOR: "",
      SUPPLIER: "",
      AQM: "",
      MERCHANDISER: "",
    },
  });

  // Step 8 debit-note supporting photos. We keep these separate from
  // `cartonUploadPhotos` / `cartonInspectPhotos` so the submit payload
  // can tag them with `kind = 'EVAL_DEBIT_NOTE'` without colliding with
  // the Step 5 carton kinds. Same upload endpoint as everything else.
  const [debitNotePhotos, setDebitNotePhotos] = useState<UploadedPhoto[]>([]);
  // Carton-level photo buckets (Step 7). Each is a list of photos already
  // uploaded to the server via /uploads/photo. Required — submit gates on
  // both lists being non-empty.
  const [cartonUploadPhotos, setCartonUploadPhotos] = useState<UploadedPhoto[]>(
    [],
  );
  const [cartonInspectPhotos, setCartonInspectPhotos] = useState<
    UploadedPhoto[]
  >([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  // `newDefect` is the in-progress row the inspector is currently
  // building (severity + qty + description + photos). At least one
  // photo must be attached before "Add" becomes enabled. On Add the
  // photos move into the saved defect row.
  const [newDefect, setNewDefect] = useState<Defect>({
    severity: "MAJOR",
    description: "",
    quantity: 1,
    photos: [],
  });
  // When the inspector switches the severity dropdown mid-edit we
  // reset the pending photos — keeping a photo already attached to a
  // Major entry under a Minor entry would be misleading, and the
  // inspector's intent for that photo was specifically for the
  // severity they originally picked.
  function setNewDefectSeverity(sev: Defect["severity"]) {
    setNewDefect((d) => ({
      ...d,
      severity: sev,
      // Keep photos if severity unchanged (so toggling back to the
      // original severity restores them); clear only when the
      // severity actually changes.
      photos: d.severity === sev ? d.photos : [],
    }));
  }

  // Step 6 "Evaluation checks" — fixed set of ten yes/no readiness
  // questions. When a question is answered Yes, the form reveals a
  // PhotoUploader underneath and at least one photo must be attached
  // before the step is considered done. The `key` matches the
  // `photos.kind` enum value on the API side so the existing upload
  // endpoint is the single binary store. Shown for every inspection
  // type, including INLINE — the old "INLINE hides Evaluation checks"
  // special case has been removed (see the longer comment near the
  // top of the component for context).
  type EvalAnswer = "" | "YES" | "NO";
  type EvalCheck = {
    key: string;
    label: string;
    answer: EvalAnswer;
    photos: UploadedPhoto[];
  };
  const [evalChecks, setEvalChecks] = useState<EvalCheck[]>(() => [
    {
      key: "INLINE_INSPECTION_DONE",
      label: "Inline Inspection Done",
      answer: "",
      photos: [],
    },
    {
      key: "PP_SAMPLE_APPROVED",
      label: "PP Sample Approved",
      answer: "",
      photos: [],
    },
    { key: "IC_AVAILABLE", label: "IC Available", answer: "", photos: [] },
    { key: "BARCODE", label: "Barcode", answer: "", photos: [] },
    { key: "CARE_LABEL", label: "Care Label", answer: "", photos: [] },
    {
      key: "PACKING_LIST_AVAILABLE",
      label: "Packing List Available",
      answer: "",
      photos: [],
    },
    { key: "PO_SAME", label: "PO Same", answer: "", photos: [] },
    {
      key: "ATTACH_MEASUREMENT_SHEET",
      label: "Attach Measurement Sheet",
      answer: "",
      photos: [],
    },
    { key: "STORAGE_OK", label: "Storage OK", answer: "", photos: [] },
    {
      key: "TEST_REPORT_AVAILABLE",
      label: "Test report available",
      answer: "",
      photos: [],
    },
  ]);
  function setEvalAnswer(idx: number, answer: "YES" | "NO") {
    setEvalChecks((prev) => {
      const next = [...prev];
      const cur = next[idx];
      // Switching to NO clears any photos that were attached to the
      // previous YES — keeping them would be misleading.
      next[idx] = {
        ...cur,
        answer,
        photos: answer === "YES" ? cur.photos : [],
      };
      return next;
    });
  }
  function setEvalPhotos(idx: number, photos: UploadedPhoto[]) {
    setEvalChecks((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], photos };
      return next;
    });
  }

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<{
    id: string;
    result: string;
  } | null>(null);
  // `attemptedSubmit` flips to true the first time the user clicks Submit.
  // Until then we don't show "missing field" styling — it would be noisy on a
  // freshly opened form. After the click, missing required fields get a red
  // ring so the user can see exactly what's still needed.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  // Scroll the submit-error banner into view when it appears, so the user
  // sees exactly why their submit didn't go through instead of having to hunt
  // for the (otherwise silent) failure.
  useEffect(() => {
    if (!submitError) return;
    if (typeof window === "undefined") return;
    const el = document.getElementById("submit-error-banner");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [submitError]);

  // ---- live AQL ----
  // All sampling-plan numbers come from the picked AQL master row.
  const aql = useMemo(() => {
    const row = aqlMaster.find((m) => m.id === draft.aqlMasterId);
    if (!row) {
      return {
        codeLetter: "",
        sampleSize: 0,
        criticalAc: 0,
        criticalRe: 1,
        majorAc: 0,
        majorRe: 1,
        minorAc: 0,
        minorRe: 1,
      };
    }
    // codeLetter is derived from min-max for display; matches backend convention.
    const codeLetter = `${row.minQty}-${row.maxQty}`;
    // Pass/Reject thresholds (majorAc/majorRe) are intentionally NOT copied
    // from the AQL master row — they are computed at evaluation time by
    // `calculateSampling()` in lib/aql.ts. Until that runs, fall back to the
    // conservative 0/1 defaults so the chip display stays sensible.
    return {
      codeLetter,
      sampleSize: row.sampleSize,
      criticalAc: 0,
      criticalRe: 1,
      majorAc: 0,
      majorRe: 1,
      minorAc: 0,
      minorRe: 1,
    };
  }, [draft.aqlMasterId, aqlMaster]);
  // ---- defect helpers ----
  function addDefect() {
    if (!newDefect.description.trim()) return;
    if (newDefect.photos.length < 1) return; // mandatory photo gate
    setDefects([
      ...defects,
      { ...newDefect, description: newDefect.description.trim() },
    ]);
    setNewDefect({
      severity: newDefect.severity,
      description: "",
      quantity: 1,
      photos: [],
    });
  }
  function removeDefect(i: number) {
    setDefects(defects.filter((_, idx) => idx !== i));
  }
  function setDefectPhotos(i: number, photos: UploadedPhoto[]) {
    setDefects((prev) =>
      prev.map((d, idx) => (idx === i ? { ...d, photos } : d)),
    );
  }

  // ---- auto-sync defect totals ----
  // Total MAJOR and Total MINOR are READ-ONLY inputs driven entirely by
  // the defect list. Any add / remove / qty / severity change re-derives
  // them in place so the values always match what the inspector entered.
  // Only Major + Minor severities exist for per-defect rows; Critical is
  // tracked at the lot level, not as a per-defect row, so it stays 0.
  const defectSignature = defects
    .map((d) => `${d.severity}:${d.quantity}`)
    .join("|");
  useEffect(() => {
    const m = defects
      .filter((d) => d.severity === "MAJOR")
      .reduce((s, d) => s + d.quantity, 0);
    const n = defects
      .filter((d) => d.severity === "MINOR")
      .reduce((s, d) => s + d.quantity, 0);
    setDraft((d) =>
      d.totalMajor === m && d.totalMinor === n
        ? d
        : { ...d, totalMajor: m, totalMinor: n },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defectSignature]);

  // ---- validation ----
  // Step 7 carton counters: parsed once so the rule "inspected ≤ total"
  // can be checked in `canSubmit` and shown live in the form.
  const totalCartonsNum = /^\d+$/.test(draft.totalCartons)
    ? Number(draft.totalCartons)
    : NaN;
  const inspectedCartonsNum = /^\d+$/.test(draft.inspectedCartons)
    ? Number(draft.inspectedCartons)
    : NaN;
  const inspectedExceedsTotal =
    Number.isFinite(totalCartonsNum) &&
    Number.isFinite(inspectedCartonsNum) &&
    inspectedCartonsNum > totalCartonsNum;

  // Step 7 completion: how many of the 4 carton-related required fields are
  // currently satisfied. Surfaced in the section header as "X / 4 required"
  // so the user sees something's still missing without having to click Submit.
  const cartonFieldsFilled =
    (Number.isFinite(totalCartonsNum) && totalCartonsNum >= 1 ? 1 : 0) +
    (Number.isFinite(inspectedCartonsNum) &&
    inspectedCartonsNum >= 1 &&
    !inspectedExceedsTotal
      ? 1
      : 0) +
    (cartonUploadPhotos.length >= 1 ? 1 : 0) +
    (cartonInspectPhotos.length >= 1 ? 1 : 0);

  // INLINE inspections don't have a final shipment of pre-packed cartons, so
  // the 4 carton-level fields (Total Cartons, Inspected Cartons, Carton Upload
  // Photos, Carton Inspect Photos) are skipped. The user still picks an AQL
  // sampling row — only the carton counters + carton photos are optional.
  const skipCartons = draft.inspectionType.trim().toUpperCase() === "INLINE";

  // Step 6 "Evaluation checks" used to be hidden for INLINE inspections
  // on the theory that readiness questions don't apply on the production
  // line. Owais has flagged that as confusing for end users — switching
  // the inspection type to INLINE made the whole Evaluation checks card
  // vanish mid-form. The questions themselves (Inline Inspection Done,
  // IC Available, Barcode, Care Label, PO Same, Packing List Available,
  // Attach Measurement Sheet, Storage OK, PP Sample Approved, Test
  // report available) all still make sense for INLINE; the user just
  // answers them in the same Yes/No + supporting-photo flow as any
  // other inspection type. The step is therefore always visible.
  // (`skipEvalChecks` is intentionally not defined any more — the JSX
  // below and the stepDone.sEval check both rely on it being falsy for
  // every inspection type, including INLINE.)

  // ---- per-step completion ----
  // Each step is "done" when its required inputs are valid. Used by the
  // sidebar nav (click-to-jump + checkmark), the sticky top progress bar,
  // and the sticky bottom submit bar. Step 5 (Identification) is optional,
  // // so we treat it as done whenever the user has either touched it or
  // moved on (any non-empty value counts as engagement).
  const stepDone = {
    s1: !!draft.inspectionType,
    s2: !!draft.productCategoryId && !!draft.merchandiserId,
    s3: !!draft.supplierId,
    s4: !!draft.inspectorMasterId,
    s5:
      !!draft.poNumber.trim() ||
      !!draft.itemNumber.trim() ||
      !!draft.color.trim() ||
      !!draft.itemDescription.trim(),
    s6:
      Number(draft.orderQuantity) > 0 &&
      Number(draft.presentedQuantity) > 0 &&
      Number(draft.inspectedQuantity) > 0 &&
      !!draft.fabricQuality.trim(),
    s7:
      // Carton counters and carton photos are OPTIONAL. If the user has
      // carton data they can fill it in, but Step 7 is satisfied by picking
      // an AQL sampling row alone. This applies to every inspection type —
      // INLINE inspections additionally HIDE the carton fields entirely
      // (handled in the JSX below).
      !!draft.aqlMasterId && !inspectedExceedsTotal,
    // Step 6 Evaluation checks — every question needs a Yes/No answer,
    // and every "Yes" must carry at least one supporting photo. Shown for
    // every inspection type (INLINE included) so the form behaviour is
    // consistent regardless of the inspection-type selection.
    sEval: evalChecks.every(
      (c) => c.answer === "NO" || (c.answer === "YES" && c.photos.length >= 1),
    ),
    s8:
      // The Defects card only marks "done" once the inspector has actually
      // recorded at least one defect — i.e. Total MAJOR > 0 or
      // Total MINOR > 0. Showing a green check at all zeros would
      // mislead the user into thinking the step is complete when no
      // defects have been captured yet. (Defects are still OPTIONAL —
      // an inspection can legitimately have zero defects — but in that
      // case the badge stays neutral instead of green, so the user
      // knows the totals reflect an empty list rather than a finished
      // tally.)
      (Number(draft.totalMajor) || 0) > 0 ||
      (Number(draft.totalMinor) || 0) > 0,
    // Step 8 Debit note — answer chosen (Yes or No). If Yes, a
    // non-empty comment is required. We treat both sub-cases here so
    // the sidebar nav reflects the full state in one badge. When Yes,
    // we require both a non-empty comment AND at least one supporting
    // photo (mirrors the Evaluation-checks rule for Yes answers).
    sDebit:
      draft.debitNote === "NO" ||
      (draft.debitNote === "YES" &&
        draft.debitNoteComment.trim().length > 0 &&
        debitNotePhotos.length >= 1),
    s9: true, // read-only AQL preview, never blocks
    // Step 10 Signatures — any one of the four stakeholder canvases
    // (QC Inspector / Supplier / AQM / Merchandiser) is enough to
    // allow submission. The form serialises the full set into the
    // `signatures` array in the submit payload and the API persists
    // it on the `signatures` JSONB column; empty canvases are dropped
    // server-side so a partial signing round is a normal flow rather
    // than an error. `sSignature` is satisfied as soon as one role
    // has produced a non-empty PNG data URL.
    sSignature: SIGNATURE_ROLES.some((r) => !!draft.signatures[r.role]),
  };

  // Total required-fields filled — used by the sticky progress bar. The four
  // carton-level fields (Total Cartons, Inspected Cartons, Carton Upload
  // Photos, Carton Inspect Photos) are OPTIONAL across every inspection
  // type — they exist for users who have carton data but never block submit.
  // Five mandatory dropdowns now include the merchandiser selected for the
  // chosen product category, followed by 3 quantities, fabric quality,
  // Evaluation checks, Debit note choice, and a signature (12 total).
  // The Evaluation
  // checks step now contributes to the count for INLINE inspections too
  // — the previous 9-vs-10 split between INLINE and other inspection
  // types was confusing for end users and has been removed.
  const requiredFilledTotal =
    (stepDone.s1 ? 1 : 0) +
    (draft.productCategoryId ? 1 : 0) +
    (draft.merchandiserId ? 1 : 0) +
    (stepDone.s3 ? 1 : 0) +
    (stepDone.s4 ? 1 : 0) +
    (Number(draft.orderQuantity) > 0 ? 1 : 0) +
    (Number(draft.presentedQuantity) > 0 ? 1 : 0) +
    (Number(draft.inspectedQuantity) > 0 ? 1 : 0) +
    (!!draft.fabricQuality.trim() ? 1 : 0) +
    (stepDone.sEval ? 1 : 0) +
    (stepDone.sDebit ? 1 : 0) +
    (stepDone.sSignature ? 1 : 0);
  const requiredTotal = 12;
  const overallPct = Math.round((requiredFilledTotal / requiredTotal) * 100);

  // ---- collapse state for completed steps ----
  // Each step starts expanded. Once the user fills all required fields in a
  // step, that step auto-collapses so the user sees a tighter, more focused
  // view. They can click the header to re-expand.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // After attempted submit, expand the first incomplete step so the user
  // sees what's missing without hunting.
  useEffect(() => {
    if (!attemptedSubmit) return;
    if (!stepDone.s1) setCollapsed((c) => ({ ...c, s1: false }));
    else if (!stepDone.s2) setCollapsed((c) => ({ ...c, s2: false }));
    else if (!stepDone.s3) setCollapsed((c) => ({ ...c, s3: false }));
    else if (!stepDone.s4) setCollapsed((c) => ({ ...c, s4: false }));
    else if (!stepDone.s6) setCollapsed((c) => ({ ...c, s6: false }));
    else if (!stepDone.s7) setCollapsed((c) => ({ ...c, s7: false }));
  }, [
    attemptedSubmit,
    stepDone.s1,
    stepDone.s2,
    stepDone.s3,
    stepDone.s4,
    stepDone.s6,
    stepDone.s7,
  ]);

  // Refs for each step's section element so the sidebar nav can scrollIntoView.
  // s1 anchors the combined "Basic information" card (was previously s1/s2/s3
  // before the merge — those three StepCards are now one).
  const s1Ref = useRef<HTMLDivElement>(null);
  const s4Ref = useRef<HTMLDivElement>(null);
  const s5Ref = useRef<HTMLDivElement>(null);
  const s6Ref = useRef<HTMLDivElement>(null);
  const s7Ref = useRef<HTMLDivElement>(null);
  const s8Ref = useRef<HTMLDivElement>(null);
  // Renumbering on 2026-08-29: Evaluation checks inserted between
  // Sample & cartons (s7) and Defects (s8). The new card lives under a
  // fresh `sEval` step key so existing s8/s9 logic stays intact; the
  // *display* indices in the sidebar/cards bump downstream. The Debit
  // note card sits between Defects and AQL plan under `sDebit` (also
  // fresh — keeps existing stepKeys untouched). 2026-08-30: Step 10
  // Inspector signature added after the AQL plan under `sSignature`.
  // 2026-09-04: the previous INLINE-skip special case for `sEval` has
  // been removed so the Evaluation checks card stays visible for every
  // inspection type. Switching the inspection type mid-form no longer
  // hides the card mid-flow.
  const sEvalRef = useRef<HTMLDivElement>(null);
  const sDebitRef = useRef<HTMLDivElement>(null);
  const s9Ref = useRef<HTMLDivElement>(null);
  const sSignatureRef = useRef<HTMLDivElement>(null);
  const stepRefs: Record<string, React.RefObject<HTMLDivElement>> = {
    s1: s1Ref,
    s4: s4Ref,
    s5: s5Ref,
    s6: s6Ref,
    s7: s7Ref,
    sEval: sEvalRef,
    s8: s8Ref,
    sDebit: sDebitRef,
    s9: s9Ref,
    sSignature: sSignatureRef,
  };

  // Step 6 (Evaluation checks) used to be hidden for INLINE inspections
  // — that special case has been removed. The card is now visible for
  // every inspection type. The sEval step still uses its own ref so the
  // sidebar nav can scroll to it without disturbing the other steps.
  function jumpTo(key: string) {
    const el = stepRefs[key]?.current;
    if (!el) return;
    // Expand the target step if it was collapsed.
    setCollapsed((c) => ({ ...c, [key]: false }));
    // Defer scroll a beat so the expand renders before we measure.
    setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  const canSubmit =
    !!draft.inspectionType &&
    !!draft.productCategoryId &&
    !!draft.merchandiserId &&
    !!draft.supplierId &&
    !!draft.inspectorMasterId &&
    // `categoryId` (legacy AQL-bearing categories master) is OPTIONAL —
    // the operator wiped the categories table out of the system, so we
    // don't block submit on it. `aqlMasterId` still gates sampling math.
    !!draft.aqlMasterId &&
    Number(draft.orderQuantity) > 0 &&
    Number(draft.presentedQuantity) > 0 &&
    Number(draft.inspectedQuantity) > 0 &&
    // Cross-field sanity check: if the user entered Inspected Cartons
    // without Total Cartons (or vice versa), or Inspected > Total, that's
    // not a hard block but the form surfaces it in the field hint.
    !inspectedExceedsTotal &&
    !!draft.fabricQuality.trim() &&
    // Step 6 Evaluation checks: every question needs a Yes/No + ≥1 photo
    // on every Yes. Shown for every inspection type (INLINE included) so
    // the submit gate is identical regardless of the inspection type.
    stepDone.sEval &&
    // Step 8 Debit note — Yes/No must be chosen, and Yes must carry a
    // comment.
    stepDone.sDebit &&
    // Inspector must explicitly choose an inspection status. The default
    // empty string ensures the choice is deliberate (no auto-prediction
    // overrides the inspector's verdict on submission).
    !!draft.inspectionStatus &&
    // Step 10 Signatures — every one of the four stakeholder
    // canvases must be signed. We delegate to `stepDone.sSignature`
    // (same boolean the sidebar / progress bar use) so the gate
    // stays in sync if the role list ever changes.
    stepDone.sSignature &&
    !submitting;

  // Human-readable list of which required fields are still missing or invalid.
  // Used to tell the user exactly what to fix when Submit is clicked but the
  // form is incomplete — without this, the click silently does nothing and the
  // user has no idea why their save didn't go through.
  const missingFields: string[] = [];
  if (!draft.inspectionType) missingFields.push("Inspection type");
  if (!draft.productCategoryId) missingFields.push("Product category");
  if (!draft.merchandiserId) missingFields.push("Merchandiser");
  if (!draft.supplierId) missingFields.push("Supplier");
  if (!draft.inspectorMasterId) missingFields.push("Inspector");
  // `categoryId` is intentionally omitted — categories was wiped from
  // the system and the user didn't re-seed it, so we don't surface a
  // missing field that the user can't reasonably fill from the UI.
  if (!draft.aqlMasterId) missingFields.push("AQL master row");
  if (!(Number(draft.orderQuantity) > 0)) missingFields.push("Order quantity");
  if (!(Number(draft.presentedQuantity) > 0))
    missingFields.push("Presented quantity");
  if (!(Number(draft.inspectedQuantity) > 0))
    missingFields.push("Inspected quantity");
  if (!draft.fabricQuality.trim()) missingFields.push("Fabric quality / type");
  if (!draft.inspectionStatus)
    missingFields.push(
      "Inspection status (Pass / Fail / Rework / Hold / Commercial Approved / Reject)",
    );
  // Step 10 Signatures — any one stakeholder signing is enough. We
  // surface a single "at least one signature" entry instead of
  // listing all four canvases, so the inspector knows the
  // requirement is "1 of 4", not "all 4". The four canvases stay
  // visible on the form (just optional individually).
  if (!SIGNATURE_ROLES.some((r) => !!draft.signatures[r.role])) {
    missingFields.push(
      "Signature — at least one of the four stakeholders must sign",
    );
  }
  // Step 8 Debit note — Yes/No must be chosen; Yes without a comment
  // is also incomplete.
  if (!draft.debitNote) {
    missingFields.push("Debit note (choose Yes or No)");
  } else if (draft.debitNote === "YES" && !draft.debitNoteComment.trim()) {
    missingFields.push('Debit note — add a reason when "Yes" is selected');
  }
  // Step 6 Evaluation checks — list each unanswered question and any
  // "Yes" missing a supporting photo. Always evaluated now (including
  // for INLINE) since the card stays visible for every inspection type.
  evalChecks.forEach((c) => {
    if (!c.answer) {
      missingFields.push(`Evaluation: ${c.label} (choose Yes or No)`);
    } else if (c.answer === "YES" && c.photos.length < 1) {
      missingFields.push(
        `Evaluation: ${c.label} — at least one photo is required when "Yes"`,
      );
    }
  });
  // Carton counters + carton photos are OPTIONAL on every inspection type.
  // We only block submit if the user partially filled them and broke the
  // cross-field rule (inspected > total).
  if (inspectedExceedsTotal)
    missingFields.push(
      `Inspected Cartons must be ≤ Total Cartons (${inspectedCartonsNum} > ${totalCartonsNum})`,
    );

  async function submit() {
    if (!canSubmit) {
      // Surface exactly what's still missing — without this the user clicks
      // the button and nothing visibly happens, which was the reported bug.
      setAttemptedSubmit(true);
      if (inspectedExceedsTotal) {
        setSubmitError(
          `Inspected Cartons (${inspectedCartonsNum}) must be ≤ Total Cartons (${totalCartonsNum}).`,
        );
      } else if (missingFields.length > 0) {
        setSubmitError(
          missingFields.length === 1
            ? `Please complete this required field before submitting: ${missingFields[0]}.`
            : `Please complete these ${missingFields.length} required fields before submitting: ${missingFields.join("; ")}.`,
        );
      }
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSubmitOk(null);
    try {
      const aqlMasterRow = aqlMaster.find((m) => m.id === draft.aqlMasterId);
      const payload = {
        submissionUuid: crypto.randomUUID(),
        poNumber: optional(draft.poNumber),
        itemNumber: optional(draft.itemNumber),
        itemDescription: optional(draft.itemDescription),
        color: optional(draft.color),
        // Legacy AQL-bearing categories master is OPTIONAL (the operator
        // wiped the categories table). `optional()` collapses the empty-
        // string sentinel to `undefined` so the API's `@IsOptional()`
        // decorator treats it as not provided — an empty string would
        // fail `@IsUUID()` even though we never want to block submit on
        // this field. Same pattern applies to every optional string /
        // UUID below (root-cause fix for the `categoryId must be a UUID`
        // 400 the user reported on 2026-09-03).
        categoryId: optional(draft.categoryId),
        productCategoryId: draft.productCategoryId,
        merchandiserId: draft.merchandiserId,
        supplierId: draft.supplierId,
        inspectionType: draft.inspectionType,
        aqlMasterId: draft.aqlMasterId,
        // codeLetter is derived on the backend from the picked AQL master row.
        // sampleSize comes from the AQL master row; Pass/Reject thresholds are
        // recomputed server-side by `calculateSampling()` so the payload uses
        // the conservative 0/1 defaults here.
        codeLetter: "",
        sampleSize: aqlMasterRow?.sampleSize ?? 0,
        criticalAc: 0,
        criticalRe: 1,
        majorAc: 0,
        majorRe: 1,
        minorAc: 0,
        minorRe: 1,
        totalCritical: Number(draft.totalCritical),
        totalMajor: Number(draft.totalMajor),
        totalMinor: Number(draft.totalMinor),
        // Inspector's manual verdict is the final outcome. If they
        // haven't chosen yet, the API will default to PENDING_REVIEW
        // (we never auto-submit without a verdict). `optional()` also
        // collapses `''` to `undefined` so the API's `@IsIn([...])`
        // decorator doesn't reject the empty string.
        overallResult: optional(draft.inspectionStatus),
        inspectorMasterId: optional(draft.inspectorMasterId),
        inspectionDate: optional(draft.inspectionDate),
        deliveryDate: optional(draft.deliveryDate),
        orderQuantity: qtyToNumber(draft.orderQuantity),
        presentedQuantity: qtyToNumber(draft.presentedQuantity),
        inspectedQuantity: qtyToNumber(draft.inspectedQuantity),
        // Carton counters are OPTIONAL across every inspection type.
        // Send 0 when the user leaves them blank so the API DTO
        // (@IsInt @Min(0)) accepts the payload regardless of intent.
        // INLINE inspections send 0 unconditionally; non-INLINE keeps the
        // user-entered value (or 0 when blank).
        totalCartons: skipCartons
          ? 0
          : Number.isFinite(intStringToNumber(draft.totalCartons))
            ? intStringToNumber(draft.totalCartons)
            : 0,
        inspectedCartons: skipCartons
          ? 0
          : Number.isFinite(intStringToNumber(draft.inspectedCartons))
            ? intStringToNumber(draft.inspectedCartons)
            : 0,
        fabricQuality: optional(draft.fabricQuality),
        inspectorNotes: optional(draft.inspectorNotes),
        defects: defects.length > 0 ? defects : undefined,
        // Carton photos — OPTIONAL on every inspection type. We always
        // send the photos the user uploaded (which may be empty); the API
        // stores whatever's in the list.
        photos: [
          ...cartonUploadPhotos.map((p) => ({
            url: p.url,
            mimeType: p.mimeType,
            size: p.size,
            kind: "CARTON_UPLOAD" as const,
          })),
          ...cartonInspectPhotos.map((p) => ({
            url: p.url,
            mimeType: p.mimeType,
            size: p.size,
            kind: "CARTON_INSPECT" as const,
          })),
          // Step 8 "Defects captured" photos — at least one photo per
          // defect is mandatory (the Add button is disabled otherwise),
          // but the API re-validates that pairing so a misbehaving
          // client can't slip through with no photos. We flatten in
          // defect-row order, tagging each photo with
          // 'DEFECT_MAJOR' / 'DEFECT_MINOR' plus the matching severity
          // so the backend can pair each photo to its defect row via
          // the per-severity queue built in `inspections.service.ts`.
          ...defects.flatMap((d) =>
            d.photos.map((p) => ({
              url: p.url,
              mimeType: p.mimeType,
              size: p.size,
              severity: d.severity as "MAJOR" | "MINOR",
              kind: (d.severity === "MAJOR"
                ? "DEFECT_MAJOR"
                : "DEFECT_MINOR") as "DEFECT_MAJOR" | "DEFECT_MINOR",
            })),
          ),
          // Step 6 Evaluation photos — one row per question. For NO
          // answers we never reach this branch (the PhotoUploader is
          // hidden), but if a user toggled YES and then NO without
          // removing the photos we already wiped them via setEvalAnswer.
          ...evalChecks.flatMap((c) =>
            c.answer === "YES"
              ? c.photos.map((p) => ({
                  url: p.url,
                  mimeType: p.mimeType,
                  size: p.size,
                  // The API's PhotoInput.kind whitelist accepts
                  // EVAL_<KEY> for these, mirroring the form's key.
                  kind: ("EVAL_" + c.key) as
                    | "EVAL_INLINE_INSPECTION_DONE"
                    | "EVAL_PP_SAMPLE_APPROVED"
                    | "EVAL_IC_AVAILABLE"
                    | "EVAL_BARCODE"
                    | "EVAL_CARE_LABEL"
                    | "EVAL_PACKING_LIST_AVAILABLE"
                    | "EVAL_PO_SAME"
                    | "EVAL_ATTACH_MEASUREMENT_SHEET"
                    | "EVAL_STORAGE_OK"
                    | "EVAL_TEST_REPORT_AVAILABLE",
                }))
              : [],
          ),
          // Step 8 debit-note photos — only included when the
          // inspector answered Yes. Tagged with kind='EVAL_DEBIT_NOTE'
          // so the existing `photos` table is the single binary store.
          ...(draft.debitNote === "YES"
            ? debitNotePhotos.map((p) => ({
                url: p.url,
                mimeType: p.mimeType,
                size: p.size,
                kind: "EVAL_DEBIT_NOTE" as const,
              }))
            : []),
        ],
        // Step 6 Evaluation checks summary — snapshot of answers + photo
        // URLs at submit time. Always sent (including for INLINE) so the
        // API gets a consistent shape regardless of inspection type. The
        // answer defaults to 'NO' when the inspector left a question
        // blank, mirroring the in-form completion rule.
        evaluationChecks: evalChecks.map((c) => ({
          key: c.key,
          label: c.label,
          answer: c.answer || "NO",
          photoCount: c.photos.length,
          photoUrls: c.photos.map((p) => p.url),
        })),
        // Step 8 Debit note — always send the snapshot, even when the
        // answer is empty or No. The API normalises it into the JSONB
        // column on the inspection row. The supporting photos ride
        // along on the inspection's photos[] with kind='EVAL_DEBIT_NOTE'
        // so the existing /photos table is the single binary store.
        debitNoteSnapshot: {
          answer: draft.debitNote,
          // `comment` is an @IsString optional inside DebitNoteInput —
          // `optional()` collapses `''` to `undefined` so the API doesn't
          // reject an empty comment when the inspector answered No.
          comment: optional(draft.debitNoteComment),
          photoCount: debitNotePhotos.length,
          photoUrls: debitNotePhotos.map((p) => p.url),
        },
        // Step 10 Signatures — one snapshot per stakeholder canvas
        // (QC Inspector / Supplier / AQM / Merchandiser). The
        // `signedAt` timestamp is captured client-side at the moment
        // the user releases the pointer; the API backfills with
        // "now" if a row arrives without one. The legacy
        // `signatureBase64` field is no longer sent — the API
        // back-populates it from the QC_INSPECTOR entry so existing
        // report / detail pages keep rendering.
        signatures: SIGNATURE_ROLES.map((r) => ({
          role: r.role,
          label: r.label,
          // Empty canvas -> `undefined` via `optional()` so the nested
          // SignatureInput @IsString optional accepts the row and the
          // service drops empty entries before persisting.
          dataUrl: optional(draft.signatures[r.role]),
          signedAt: new Date().toISOString(),
        })),
      };
      const res = await clientApiFetch("/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        setSubmitError(`Save failed (${res.status}): ${txt.slice(0, 300)}`);
        return;
      }
      const created = await res.json();
      setSubmitOk({ id: created.id, result: created.overallResult });
      // refresh the list when user navigates back
      router.refresh();
    } catch (e: any) {
      setSubmitError(e?.message ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  function loadAnother() {
    setSubmitOk(null);
    setAttemptedSubmit(false);
    setDefects([]);
    setCartonUploadPhotos([]);
    setCartonInspectPhotos([]);
    setDebitNotePhotos([]);
    setEvalChecks((prev) =>
      prev.map((c) => ({ ...c, answer: "", photos: [] })),
    );
    setDraft({
      ...draft,
      poNumber: "",
      itemNumber: "",
      itemDescription: "",
      color: "",
      totalCritical: 0,
      totalMajor: 0,
      totalMinor: 0,
      inspectionStatus: "",
      debitNote: "",
      debitNoteComment: "",
      signatures: {
        QC_INSPECTOR: "",
        SUPPLIER: "",
        AQM: "",
        MERCHANDISER: "",
      },
      inspectorNotes: "",
      inspectionDate: new Date().toISOString().slice(0, 10),
      deliveryDate: "",
      merchandiserId: "",
      orderQuantity: "",
      presentedQuantity: "",
      inspectedQuantity: "",
      totalCartons: "",
      inspectedCartons: "",
      fabricQuality: "",
    });
  }

  const sevColor = (s: Defect["severity"]) =>
    s === "MAJOR"
      ? "bg-orange-100 text-orange-800 border-orange-200"
      : "bg-yellow-100 text-yellow-800 border-yellow-200";

  // Helper text for the selected product category chip so the user sees
  // what they actually picked (helps avoid the "I clicked the wrong one"
  // confusion that dropdowns hide).
  const selectedProductCategory = productCategories.find(
    (p) => p.id === draft.productCategoryId,
  );
  const availableMerchandisers = (
    selectedProductCategory?.merchandisers ?? []
  ).filter((merchandiser) => merchandiser.isActive);
  const selectedSupplier = suppliers.find((s) => s.id === draft.supplierId);
  const selectedInspector = inspectors.find(
    (i) => i.id === draft.inspectorMasterId,
  );
  const selectedAqlMaster = aqlMaster.find(
    (m) => m.id === draft.aqlMasterId && m.isActive,
  );

  // ---- sidebar nav metadata ----
  // One entry per step. The sidebar renders these top-to-bottom as large,
  // 48-px-tall chips with clear completion state and titles.
  //
  // s1/s2/s3 (Inspection type / Product category / Supplier) are now
  // grouped into a single "Basic information" card on the form, so the
  // sidebar also shows them as one combined entry. The stepDone.s1/s2/
  // s3 booleans still drive the missing-fields list and the "Required"
  // badges inside the card, but the sidebar reports a single chip whose
  // done state is the AND of all three.
  const basicInfoDone = stepDone.s1 && stepDone.s2 && stepDone.s3;
  const navSteps: Array<{
    key: string;
    label: string;
    sub?: string;
    done: boolean;
    index: number;
  }> = [
    { key: "s1", label: "Basic information", done: basicInfoDone, index: 1 },
    { key: "s4", label: "Inspector & date", done: stepDone.s4, index: 2 },
    { key: "s5", label: "Identification", done: stepDone.s5, index: 3 },
    { key: "s6", label: "Quality", done: stepDone.s6, index: 4 },
    { key: "s7", label: "Sample & cartons", done: stepDone.s7, index: 5 },
    {
      key: "sEval",
      label: "Evaluation checks",
      done: stepDone.sEval,
      index: 6,
    },
    { key: "s8", label: "Defects", done: stepDone.s8, index: 7 },
    { key: "sDebit", label: "Debit note", done: stepDone.sDebit, index: 8 },
    { key: "s9", label: "AQL plan", done: stepDone.s9, index: 9 },
    {
      key: "sSignature",
      label: "Signature",
      done: stepDone.sSignature,
      index: 10,
    },
  ];

  // First step that still needs input from the user.
  const firstIncomplete = navSteps.find(
    (s) => !s.done && s.key !== "s8" && s.key !== "s9",
  );

  // ---- sidebar nav sub-component ----
  // Large, readable vertical nav. Hidden on mobile (where the form takes
  // full width). At lg+ the column pins itself to the top of the viewport
  // (under the topbar) with `sticky`, so the progress + step list stays
  // visible while the user scrolls the MAIN form. The page itself does
  // NOT scroll — the parent wrapper locks the layout to viewport
  // height, and only the form column on the right gets a scrollbar.
  const SidebarNav = (
    <nav
      aria-label="Inspection steps"
      className="hidden lg:block w-60 shrink-0"
    >
      <div className="sticky top-2 space-y-4">
        {/* Progress summary card */}
        <div
          className={
            isClassic
              ? "rounded-2xl border-2 border-qc-strong bg-qc-strong text-qc-on shadow-md p-5"
              : "bg-white rounded-md border border-stone-200 p-4"
          }
        >
          <div
            className={
              isClassic
                ? "text-xs font-bold uppercase tracking-wider text-qc-on/80 mb-2"
                : "text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-1.5"
            }
          >
            Progress
          </div>
          <div className="flex items-baseline justify-between mb-2">
            <span
              className={
                isClassic
                  ? "text-2xl font-bold text-qc-on tabular-nums"
                  : "text-xl font-bold text-stone-900 tabular-nums"
              }
            >
              {requiredFilledTotal}
              <span
                className={
                  isClassic
                    ? "text-base font-normal text-qc-on/70"
                    : "text-sm font-normal text-stone-400"
                }
              >
                /{requiredTotal}
              </span>
            </span>
            <span
              className={
                isClassic
                  ? "text-sm font-medium text-qc-on/90"
                  : "text-xs font-medium text-stone-500"
              }
            >
              {overallPct}%
            </span>
          </div>
          <div
            className={
              isClassic
                ? "h-2 bg-qc-deep rounded-full overflow-hidden"
                : "h-1.5 bg-stone-100 rounded-full overflow-hidden"
            }
          >
            <div
              className={`h-full transition-all duration-300 ${
                overallPct === 100 ? "bg-accept" : "bg-qc"
              }`}
              style={{ width: `${overallPct}%` }}
            />
          </div>
          <div
            className={
              isClassic
                ? "text-xs text-qc-on/80 mt-2"
                : "text-[11px] text-stone-500 mt-1.5"
            }
          >
            required fields filled
          </div>
        </div>

        {/* Step list */}
        <div
          className={
            isClassic
              ? "bg-white rounded-2xl border-2 border-qc-strong shadow-sm overflow-hidden"
              : "bg-white rounded-md border border-stone-200 overflow-hidden"
          }
        >
          <div
            className={
              isClassic
                ? "px-4 py-3 border-b border-qc-strong bg-qc-strong text-qc-on"
                : "px-4 py-2 border-b border-stone-100"
            }
          >
            <div
              className={
                isClassic
                  ? "text-xs font-bold uppercase tracking-wider text-qc-on"
                  : "text-[11px] font-semibold uppercase tracking-wider text-stone-400"
              }
            >
              Sections
            </div>
          </div>
          <ul className="p-1">
            {navSteps.map((s) => {
              const isAlerted =
                firstIncomplete?.key === s.key && attemptedSubmit;
              const circleClass = isClassic
                ? `shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold transition-colors ${
                    s.done
                      ? "bg-accept text-qc-on"
                      : isAlerted
                        ? "bg-amber-500 text-white"
                        : "bg-qc-strong text-qc-on"
                  }`
                : `shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold transition-colors ${
                    s.done
                      ? "bg-accept text-white"
                      : isAlerted
                        ? "bg-white text-amber-700 border-2 border-amber-400"
                        : "bg-white text-stone-500 border-2 border-stone-300"
                  }`;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => jumpTo(s.key)}
                    className={`w-full text-left flex items-center gap-2.5 px-2.5 py-1.5 rounded transition-colors ${
                      isAlerted
                        ? "bg-amber-50 hover:bg-amber-100"
                        : "hover:bg-stone-50"
                    }`}
                  >
                    <span className={circleClass}>
                      {s.done ? "✓" : s.index}
                    </span>
                    <span
                      className={`flex-1 text-[13px] font-medium ${
                        isAlerted
                          ? "text-amber-900"
                          : s.done
                            ? "text-stone-400"
                            : "text-stone-700"
                      }`}
                    >
                      {s.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Cancel / exit */}
        <a
          href="/inspections"
          className={
            isClassic
              ? "block text-center px-4 py-2.5 text-sm font-medium text-qc-on bg-qc-strong hover:bg-qc-deep rounded-xl transition-colors"
              : "block text-center px-3 py-2 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-md hover:bg-stone-50 transition-colors"
          }
        >
          ← Cancel & exit
        </a>
      </div>
    </nav>
  );

  return (
    <div
      className={
        isClassic
          ? "flex flex-col lg:flex-row gap-6 h-full min-h-0"
          : "flex flex-col lg:flex-row gap-6 h-full min-h-0"
      }
    >
      {SidebarNav}
      <div
        className={
          isClassic
            ? "qc-scroll flex-1 min-w-0 max-w-3xl space-y-3 overflow-y-auto pr-2 -mr-2 pb-32 min-h-0"
            : "qc-scroll flex-1 min-w-0 max-w-3xl space-y-3 overflow-y-auto pr-2 -mr-2 min-h-0"
        }
      >
        {submitOk && (
          <div className="bg-accept-soft border-2 border-accept-border rounded-2xl p-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-base font-semibold text-accept-deep flex items-center gap-2">
                ✓ Inspection submitted
                <span
                  className={`px-2 py-0.5 rounded text-sm ${
                    submitOk.result === "PASS"
                      ? "bg-accept text-qc-on"
                      : submitOk.result === "COMMERCIAL_APPROVED"
                        ? "bg-blue-600 text-white"
                        : "bg-reject text-qc-on"
                  }`}
                >
                  {submitOk.result.replace(/_/g, " ")}
                </span>
              </div>
              <div className="text-xs text-accept-deep mt-1 font-mono">
                id {submitOk.id}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={loadAnother}
                className="px-4 py-2 text-sm font-medium border border-accept-border rounded-lg hover:bg-white"
              >
                Submit another
              </button>
              <a
                href={`/inspections/${submitOk.id}`}
                className="px-4 py-2 text-sm font-medium bg-accept text-qc-on rounded-lg hover:bg-accept-deep"
              >
                View detail →
              </a>
            </div>
          </div>
        )}

        {submitError && (
          <div
            id="submit-error-banner"
            className="bg-reject-soft border-2 border-reject-border rounded-2xl p-4 text-sm text-reject-deep"
            role="alert"
          >
            <span className="font-semibold">Error:</span> {submitError}
          </div>
        )}

        {/* ---- Basic information (combines s1/s2/s3) ---- */}
        <StepCard
          stepKey="s1"
          index={1}
          title="Basic information"
          subtitle="Four required decisions on every inspection — the form configures itself around these choices."
          done={basicInfoDone}
          highlightIncomplete={attemptedSubmit && !basicInfoDone}
          sectionRef={s1Ref}
          variant={layout}
          badge={
            basicInfoDone ? (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-accept-soft text-accept-deep border border-accept-border font-medium">
                ✓ Complete
              </span>
            ) : (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
                Required
              </span>
            )
          }
        >
          <div className="pt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Field label="Inspection type" required>
              <select
                id="it-type"
                value={draft.inspectionType}
                onChange={(e) =>
                  setDraft({ ...draft, inspectionType: e.target.value })
                }
                className={`w-full px-3 py-2 border rounded text-sm font-medium transition-colors ${
                  attemptedSubmit && !stepDone.s1
                    ? "border-amber-400 bg-white"
                    : stepDone.s1
                      ? "border-qc bg-white"
                      : "border-stone-300 bg-white"
                }`}
                aria-required="true"
                required
              >
                <option value="">— Select an inspection type —</option>
                {inspectionTypes.map((t) => (
                  <option key={t.id} value={t.code}>
                    {t.code} — {t.label}
                  </option>
                ))}
              </select>
              {inspectionTypes.length === 0 && (
                <p className="text-[11px] text-amber-800 mt-1">
                  No active inspection types. Add one in{" "}
                  <a href="/inspection-types" className="underline">
                    Inspection Types
                  </a>
                  .
                </p>
              )}
            </Field>

            <Field label="Product category" required>
              <select
                id="it-pc"
                value={draft.productCategoryId}
                onChange={(e) => {
                  const productCategoryId = e.target.value;
                  const category = productCategories.find(
                    (item) => item.id === productCategoryId,
                  );
                  const activeMerchandisers = (
                    category?.merchandisers ?? []
                  ).filter((item) => item.isActive);
                  setDraft({
                    ...draft,
                    productCategoryId,
                    merchandiserId:
                      activeMerchandisers.length === 1
                        ? activeMerchandisers[0].id
                        : "",
                  });
                }}
                className={`w-full px-3 py-2 border rounded text-sm font-medium transition-colors ${
                  attemptedSubmit && !draft.productCategoryId
                    ? "border-amber-400 bg-white"
                    : draft.productCategoryId
                      ? "border-qc bg-white"
                      : "border-stone-300 bg-white"
                }`}
                aria-required="true"
                required
              >
                <option value="">— Select a product category —</option>
                {productCategories.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
              {productCategories.length === 0 && (
                <p className="text-[11px] text-amber-800 mt-1">
                  No active product categories. Add one in{" "}
                  <a href="/product-categories" className="underline">
                    Product Categories
                  </a>
                  .
                </p>
              )}
            </Field>

            <Field label="Supplier" required>
              <select
                id="it-sup"
                value={draft.supplierId}
                onChange={(e) =>
                  setDraft({ ...draft, supplierId: e.target.value })
                }
                className={`w-full px-3 py-2 border rounded text-sm font-medium transition-colors ${
                  attemptedSubmit && !stepDone.s3
                    ? "border-amber-400 bg-white"
                    : stepDone.s3
                      ? "border-qc bg-white"
                      : "border-stone-300 bg-white"
                }`}
                aria-required="true"
                required
              >
                <option value="">— Select a supplier —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.vendorId ? `${s.vendorId} — ${s.name}` : s.name}
                  </option>
                ))}
              </select>
              {suppliers.length === 0 && (
                <p className="text-[11px] text-amber-800 mt-1">
                  No suppliers. Add one in{" "}
                  <a href="/suppliers" className="underline">
                    Suppliers
                  </a>
                  .
                </p>
              )}
            </Field>
          </div>
        </StepCard>

        {/* ---- Step 2: Inspector & date (formerly s4 before the Basic-information merge) ---- */}
        <StepCard
          stepKey="s4"
          index={2}
          title="Inspector & date"
          subtitle="Who is signing this inspection, and when."
          done={stepDone.s4}
          highlightIncomplete={attemptedSubmit && !stepDone.s4}
          sectionRef={s4Ref}
          variant={layout}
          badge={
            selectedInspector ? (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-accept-soft text-accept-deep border border-accept-border font-medium">
                ✓ {selectedInspector.name}
              </span>
            ) : (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
                Required
              </span>
            )
          }
        >
          <div className="pt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Inspection date" required>
                <input
                  id="it-date"
                  type="date"
                  value={draft.inspectionDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) =>
                    setDraft({ ...draft, inspectionDate: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded text-sm font-medium border-stone-300 bg-white"
                  aria-required="true"
                  required
                />
              </Field>
              <Field label="Inspector" required>
                <select
                  id="it-insp"
                  value={draft.inspectorMasterId}
                  onChange={(e) =>
                    setDraft({ ...draft, inspectorMasterId: e.target.value })
                  }
                  className={`w-full px-3 py-2 border rounded text-sm font-medium transition-colors ${
                    attemptedSubmit && !stepDone.s4
                      ? "border-amber-400 bg-white"
                      : stepDone.s4
                        ? "border-qc bg-white"
                        : "border-stone-300 bg-white"
                  }`}
                  aria-required="true"
                  required
                >
                  <option value="">— Select an inspector —</option>
                  {inspectors.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Delivery date">
                <input
                  id="it-delivery"
                  type="date"
                  value={draft.deliveryDate}
                  min={
                    draft.inspectionDate
                      ? new Date(
                          new Date(draft.inspectionDate).getTime() + 86400000,
                        )
                          .toISOString()
                          .slice(0, 10)
                      : new Date().toISOString().slice(0, 10)
                  }
                  onChange={(e) =>
                    setDraft({ ...draft, deliveryDate: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded text-sm font-medium border-stone-300 bg-white"
                />
              </Field>

              <Field label="Merchandiser" required>
                <select
                  id="it-merch"
                  value={draft.merchandiserId}
                  onChange={(e) =>
                    setDraft({ ...draft, merchandiserId: e.target.value })
                  }
                  disabled={!draft.productCategoryId}
                  className={`w-full px-3 py-2 border rounded text-sm font-medium transition-colors disabled:bg-stone-100 disabled:text-stone-400 ${
                    attemptedSubmit && !draft.merchandiserId
                      ? "border-amber-400 bg-white"
                      : draft.merchandiserId
                        ? "border-qc bg-white"
                        : "border-stone-300 bg-white"
                  }`}
                  aria-required="true"
                  required
                >
                  <option value="">
                    {draft.productCategoryId
                      ? "— Select a merchandiser —"
                      : "— Select a product category first —"}
                  </option>
                  {availableMerchandisers.map((merchandiser) => (
                    <option key={merchandiser.id} value={merchandiser.id}>
                      {merchandiser.name}
                    </option>
                  ))}
                </select>
                {draft.productCategoryId &&
                  availableMerchandisers.length === 0 && (
                    <p className="text-[11px] text-amber-800 mt-1">
                      No active merchandiser is assigned to this category.
                      Assign one in{" "}
                      <a href="/product-categories" className="underline">
                        Product Categories
                      </a>
                      .
                    </p>
                  )}
              </Field>
            </div>
            {inspectors.length === 0 && (
              <p className="text-xs text-amber-800 mt-2">
                No active inspectors are configured. Add one in{" "}
                <a href="/inspectors" className="underline">
                  Inspectors
                </a>{" "}
                before creating an inspection.
              </p>
            )}
          </div>
        </StepCard>

        {/* ---- Step 3: Identification ---- */}
        <StepCard
          stepKey="s5"
          index={3}
          title="Identification"
          subtitle="PO, design, color, item description — all optional but helpful for traceability."
          done={stepDone.s5}
          sectionRef={s5Ref}
          variant={layout}
          badge={
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
              Optional
            </span>
          }
        >
          <div className="pt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="PO number">
              <input
                id="po"
                value={draft.poNumber}
                onChange={(e) =>
                  setDraft({ ...draft, poNumber: e.target.value })
                }
                placeholder="e.g. PO-2026-0451"
                className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white"
              />
            </Field>
            <Field label="Design number">
              <input
                id="item"
                value={draft.itemNumber}
                onChange={(e) =>
                  setDraft({ ...draft, itemNumber: e.target.value })
                }
                placeholder="e.g. ITM-A-213"
                className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white"
              />
            </Field>
            <Field label="Color">
              <input
                id="item-color"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                placeholder="e.g. Navy / Red"
                className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white"
              />
            </Field>
            <Field label="Item description">
              <input
                id="item-desc"
                value={draft.itemDescription}
                onChange={(e) =>
                  setDraft({ ...draft, itemDescription: e.target.value })
                }
                placeholder="Optional — what the item is"
                className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white"
              />
            </Field>
          </div>
        </StepCard>

        {/* ---- Step 4: Quality (mandatory quantities / fabric) ---- */}
        <StepCard
          stepKey="s6"
          index={4}
          title="Quality"
          subtitle="Order / presented / inspected quantities and fabric — all required."
          done={stepDone.s6}
          highlightIncomplete={attemptedSubmit && !stepDone.s6}
          sectionRef={s6Ref}
          variant={layout}
          badge={
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
              Required
            </span>
          }
        >
          <div className="pt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Order quantity" required>
              <input
                id="q-order-qty"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]{0,2}"
                value={draft.orderQuantity}
                onChange={(e) => {
                  const v = e.target.value;
                  if (isValidQty(v)) setDraft({ ...draft, orderQuantity: v });
                }}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text");
                  if (!isValidQty(pasted)) e.preventDefault();
                }}
                onKeyDown={(e) => {
                  if (["-", "+", "e", "E", " "].includes(e.key))
                    e.preventDefault();
                }}
                placeholder="e.g. 1500"
                maxLength={16}
                className={`w-full px-3 py-2 border rounded text-sm font-medium transition-colors ${
                  attemptedSubmit && !(Number(draft.orderQuantity) > 0)
                    ? "border-amber-400 bg-white"
                    : "border-stone-300 bg-white"
                }`}
                aria-invalid={
                  attemptedSubmit && !(Number(draft.orderQuantity) > 0)
                }
                aria-required="true"
                required
              />
            </Field>
            <Field label="Presented quantity" required>
              <input
                id="q-presented-qty"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]{0,2}"
                value={draft.presentedQuantity}
                onChange={(e) => {
                  const v = e.target.value;
                  if (isValidQty(v))
                    setDraft({ ...draft, presentedQuantity: v });
                }}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text");
                  if (!isValidQty(pasted)) e.preventDefault();
                }}
                onKeyDown={(e) => {
                  if (["-", "+", "e", "E", " "].includes(e.key))
                    e.preventDefault();
                }}
                placeholder="e.g. 1500"
                maxLength={16}
                className={`w-full px-3 py-2 border rounded text-sm font-medium transition-colors ${
                  attemptedSubmit && !(Number(draft.presentedQuantity) > 0)
                    ? "border-amber-400 bg-white"
                    : "border-stone-300 bg-white"
                }`}
                aria-invalid={
                  attemptedSubmit && !(Number(draft.presentedQuantity) > 0)
                }
                aria-required="true"
                required
              />
            </Field>
            <Field label="Inspected quantity" required>
              <input
                id="q-inspected-qty"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]{0,2}"
                value={draft.inspectedQuantity}
                onChange={(e) => {
                  const v = e.target.value;
                  if (isValidQty(v))
                    setDraft({ ...draft, inspectedQuantity: v });
                }}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text");
                  if (!isValidQty(pasted)) e.preventDefault();
                }}
                onKeyDown={(e) => {
                  if (["-", "+", "e", "E", " "].includes(e.key))
                    e.preventDefault();
                }}
                placeholder="e.g. 80"
                maxLength={16}
                className={`w-full px-3 py-2 border rounded text-sm font-medium transition-colors ${
                  attemptedSubmit && !(Number(draft.inspectedQuantity) > 0)
                    ? "border-amber-400 bg-white"
                    : "border-stone-300 bg-white"
                }`}
                aria-invalid={
                  attemptedSubmit && !(Number(draft.inspectedQuantity) > 0)
                }
                aria-required="true"
                required
              />
            </Field>
            <Field label="Fabric quality / type" required>
              <input
                id="q-fabric"
                type="text"
                value={draft.fabricQuality}
                onChange={(e) =>
                  setDraft({ ...draft, fabricQuality: e.target.value })
                }
                placeholder="e.g. 100% Cotton, 200 GSM"
                className={`w-full px-3 py-2 border rounded text-sm font-medium transition-colors ${
                  attemptedSubmit && !draft.fabricQuality.trim()
                    ? "border-amber-400 bg-white"
                    : "border-stone-300 bg-white"
                }`}
                aria-invalid={attemptedSubmit && !draft.fabricQuality.trim()}
                maxLength={255}
                aria-required="true"
                required
              />
            </Field>
          </div>
        </StepCard>

        {/* ---- Step 5: Sampling plan + carton counts + carton photos ---- */}
        <StepCard
          stepKey="s7"
          index={5}
          title="Sample & cartons"
          subtitle={
            skipCartons
              ? "AQL sampling row only — carton fields are hidden for INLINE inspections."
              : "AQL sampling row. Carton counters and carton photos are optional — fill them only if you have carton data."
          }
          done={stepDone.s7}
          highlightIncomplete={attemptedSubmit && !stepDone.s7}
          sectionRef={s7Ref}
          variant={layout}
          badge={
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
              Optional · {cartonFieldsFilled}/4
            </span>
          }
        >
          <div className="pt-3">
            {/* AQL sampling plan row (existing) */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-start">
              <Field label="AQL master" required>
                <select
                  value={draft.aqlMasterId}
                  onChange={(e) =>
                    setDraft({ ...draft, aqlMasterId: e.target.value })
                  }
                  className={`w-full px-3 py-2 border rounded text-sm font-medium transition-colors ${
                    attemptedSubmit && !draft.aqlMasterId
                      ? "border-amber-400 bg-white"
                      : "border-stone-300 bg-white"
                  }`}
                  aria-invalid={attemptedSubmit && !draft.aqlMasterId}
                  aria-required="true"
                  required
                >
                  {aqlMaster.length === 0 && (
                    <option value="">— no AQL master rows —</option>
                  )}
                  {aqlMaster.map((m) => {
                    const code = `${m.minQty}-${m.maxQty}`;
                    return (
                      <option key={m.id} value={m.id}>
                        {code} · sample {m.sampleSize}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Pick a sampling-plan row from AQL master. Inspect Qty on
                  submission is taken from the row you choose here.
                </p>
              </Field>

              <div className="md:pt-5 flex flex-row gap-1.5 self-start">
                <MiniStat
                  label="Inspect"
                  value={selectedAqlMaster?.sampleSize ?? null}
                  accent="qc"
                />
              </div>
            </div>

            {/* Divider */}
            <div className="my-4 border-t border-stone-200" />

            {/* Carton-level counters + carton photos (OPTIONAL — required only for INLINE we hide them) */}
            {skipCartons ? (
              <div
                className="rounded-md border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600"
                data-testid="inline-skip-carton-notice"
              >
                <span className="font-medium text-stone-700">
                  INLINE inspection:
                </span>{" "}
                carton counters and carton photos don't apply and have been
                hidden. Pick an AQL sampling row above to complete this step.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Total cartons">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={9}
                    placeholder="e.g. 250"
                    value={draft.totalCartons}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, "");
                      setDraft({ ...draft, totalCartons: v });
                    }}
                    className={`w-full px-3 py-2 border rounded text-sm transition-colors ${
                      inspectedExceedsTotal
                        ? "border-amber-400 bg-white"
                        : "border-stone-300 bg-white"
                    }`}
                  />
                </Field>

                <Field label="Inspected cartons">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={9}
                    placeholder="e.g. 50"
                    value={draft.inspectedCartons}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, "");
                      setDraft({ ...draft, inspectedCartons: v });
                    }}
                    aria-invalid={inspectedExceedsTotal}
                    className={`w-full px-3 py-2 border rounded text-sm transition-colors ${
                      inspectedExceedsTotal
                        ? "border-amber-400 bg-white"
                        : "border-stone-300 bg-white"
                    }`}
                  />
                  {inspectedExceedsTotal && (
                    <p className="text-[11px] text-reject-deep mt-0.5">
                      Inspected Cartons ({inspectedCartonsNum}) must be ≤ Total
                      Cartons ({totalCartonsNum}).
                    </p>
                  )}
                </Field>

                <PhotoUploader
                  label="Carton Upload Photos"
                  photos={cartonUploadPhotos}
                  onChange={setCartonUploadPhotos}
                />

                <PhotoUploader
                  label="Carton Inspect Photos"
                  photos={cartonInspectPhotos}
                  onChange={setCartonInspectPhotos}
                />
              </div>
            )}
          </div>
        </StepCard>

        {/* ---- Step 6: Evaluation checks (yes/no readiness questions + supporting photos) ---- */}
        <StepCard
          stepKey="sEval"
          index={6}
          title="Evaluation checks"
          subtitle="Ten yes/no readiness checks before the lot is approved. When you answer Yes, attach at least one supporting photo. Shown for every inspection type — INLINE included."
          done={stepDone.sEval}
          highlightIncomplete={attemptedSubmit && !stepDone.sEval}
          sectionRef={sEvalRef}
          variant={layout}
          badge={
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
              Required · 10
            </span>
          }
        >
          <div className="pt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            {evalChecks.map((c, idx) => {
              const missingAnswer = attemptedSubmit && !c.answer;
              const showPhoto = c.answer === "YES";
              return (
                <div
                  key={c.key}
                  className={`rounded-md border p-4 transition-colors ${
                    missingAnswer
                      ? "border-amber-400 bg-amber-50"
                      : "border-stone-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="text-sm font-semibold text-stone-800 flex-1 min-w-[8rem]">
                      {c.label}
                      <span className="text-red-500 ml-0.5">*</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEvalAnswer(idx, "YES")}
                        aria-pressed={c.answer === "YES"}
                        className={`px-3 py-1 text-xs font-semibold rounded border transition-colors ${
                          c.answer === "YES"
                            ? "bg-accept-soft text-accept-deep border-accept-border"
                            : "bg-white text-stone-600 border-stone-300 hover:bg-stone-50"
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setEvalAnswer(idx, "NO")}
                        aria-pressed={c.answer === "NO"}
                        className={`px-3 py-1 text-xs font-semibold rounded border transition-colors ${
                          c.answer === "NO"
                            ? "bg-reject-soft text-reject-deep border-reject-border"
                            : "bg-white text-stone-600 border-stone-300 hover:bg-stone-50"
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>
                  {showPhoto && (
                    <div className="mt-3">
                      <EvalPhotoButton
                        photos={c.photos}
                        onChange={(next) => setEvalPhotos(idx, next)}
                      />
                    </div>
                  )}
                  {missingAnswer && (
                    <p className="text-[11px] text-reject-deep mt-2">
                      Please pick Yes or No before submitting.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </StepCard>

        {/* ---- Step 7: Defects ---- */}
        <StepCard
          stepKey="s8"
          index={7}
          title="Defects captured"
          subtitle="Add the defects you observed. Each entry rolls into the totals."
          done={stepDone.s8}
          sectionRef={s8Ref}
          variant={layout}
          badge={
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
              Optional · {defects.length}{" "}
              {defects.length === 1 ? "entry" : "entries"}
            </span>
          }
        >
          <div className="pt-3">
            {/* New defect row */}
            <div className="grid grid-cols-12 gap-2 mb-3 items-end">
              <div className="col-span-3">
                <label className="block text-xs font-medium text-stone-600 mb-1">
                  Severity
                </label>
                <select
                  value={newDefect.severity}
                  onChange={(e) =>
                    setNewDefectSeverity(e.target.value as Defect["severity"])
                  }
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white"
                >
                  <option value="MAJOR">Major</option>
                  <option value="MINOR">Minor</option>
                </select>
              </div>
              <div className="col-span-3">
                <label className="block text-xs font-medium text-stone-600 mb-1">
                  Qty
                </label>
                <input
                  type="number"
                  min={1}
                  value={newDefect.quantity}
                  onChange={(e) =>
                    setNewDefect({
                      ...newDefect,
                      quantity: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white"
                />
              </div>
              <div className="col-span-6">
                <label className="block text-xs font-medium text-stone-600 mb-1">
                  Description
                </label>
                <div className="flex gap-2">
                  <input
                    list={`${newDefect.severity.toLowerCase()}-presets`}
                    value={newDefect.description}
                    onChange={(e) =>
                      setNewDefect({
                        ...newDefect,
                        description: e.target.value,
                      })
                    }
                    placeholder="Describe the defect"
                    className="flex-1 px-3 py-2 border border-stone-300 rounded text-sm bg-white"
                  />
                  <button
                    type="button"
                    onClick={addDefect}
                    disabled={
                      !newDefect.description.trim() ||
                      newDefect.photos.length < 1
                    }
                    className="px-3 py-2 bg-qc-strong hover:bg-qc-deep text-qc-on rounded text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    title={
                      newDefect.photos.length < 1
                        ? "At least one photo is required before adding the defect"
                        : undefined
                    }
                  >
                    Add
                  </button>
                </div>
                <datalist id={`${newDefect.severity.toLowerCase()}-presets`}>
                  {DEFECT_PRESETS[newDefect.severity].map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Per-defect photo evidence (mandatory at least one).
              Uses the same /uploads/photo endpoint as the carton /
              evaluation / debit-note photos — every uploaded blob ends
              up in the same `photos` table, just tagged differently
              (kind: 'DEFECT_MAJOR' / 'DEFECT_MINOR'). The list here is
              the in-progress defect — once the user clicks "Add" the
              photos move onto the saved defect row in the table below. */}
            <div className="mb-3 rounded border border-dashed border-stone-300 p-3 bg-stone-50/60">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-stone-700">
                  Photo evidence for this {newDefect.severity} defect{" "}
                  <span className="text-reject-deep">*</span>
                </div>
                <div className="text-[11px] text-stone-500">
                  {newDefect.photos.length} attached · multiple allowed
                </div>
              </div>
              <PhotoUploader
                label=""
                photos={newDefect.photos}
                onChange={(next) =>
                  setNewDefect({ ...newDefect, photos: next })
                }
                highlightMissing
                hint="At least one photo required. Multiple allowed."
              />
            </div>

            {/* Defect list */}
            {defects.length > 0 && (
              <table className="w-full text-sm mb-3 border rounded overflow-hidden">
                <thead className="bg-stone-50 text-left text-xs">
                  <tr>
                    <th className="p-2">Severity</th>
                    <th className="p-2 w-16">Qty</th>
                    <th className="p-2">Description</th>
                    <th className="p-2 w-32">Photos</th>
                    <th className="p-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {defects.map((d, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">
                        <span
                          className={`px-2 py-0.5 text-xs rounded border ${sevColor(d.severity)}`}
                        >
                          {d.severity}
                        </span>
                      </td>
                      <td className="p-2 font-mono">{d.quantity}</td>
                      <td className="p-2">{d.description}</td>
                      <td className="p-2">
                        <details className="text-[11px]">
                          <summary className="cursor-pointer text-qc-deep hover:underline">
                            {d.photos.length} photo
                            {d.photos.length === 1 ? "" : "s"}
                          </summary>
                          <div className="mt-2">
                            <PhotoUploader
                              label=""
                              photos={d.photos}
                              onChange={(next) => setDefectPhotos(i, next)}
                              hint="Add more or remove individual photos."
                            />
                          </div>
                        </details>
                      </td>
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => removeDefect(i)}
                          className="text-reject hover:underline text-xs"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Totals — these are the values submitted. Critical defects are
              handled at the lot level (rule engine / lot rejection), not as
              a per-defect row, so only Major + Minor are tallied here.
              These fields are READ-ONLY: the inspector can't type into them
              — they're auto-derived from the defect list via the button
              below, so the submission always matches what the inspector
              actually entered. */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-3 border-t">
              <Field label="Total MAJOR">
                <input
                  type="number"
                  min={0}
                  readOnly
                  aria-readonly="true"
                  tabIndex={-1}
                  value={draft.totalMajor}
                  onChange={() => {}}
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-stone-100 text-stone-700 cursor-not-allowed select-none"
                />
              </Field>
              <Field label="Total MINOR">
                <input
                  type="number"
                  min={0}
                  readOnly
                  aria-readonly="true"
                  tabIndex={-1}
                  value={draft.totalMinor}
                  onChange={() => {}}
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-stone-100 text-stone-700 cursor-not-allowed select-none"
                />
              </Field>
              <Field label="Inspection status" required>
                <select
                  value={draft.inspectionStatus}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      inspectionStatus: e.target.value as
                        | ""
                        | "PASS"
                        | "FAIL"
                        | "REWORK"
                        | "HOLD"
                        | "COMMERCIAL_APPROVED"
                        | "REJECTED",
                    })
                  }
                  className={`w-full px-3 py-2 border rounded text-sm bg-white ${
                    attemptedSubmit && !draft.inspectionStatus
                      ? "border-amber-400"
                      : "border-stone-300"
                  }`}
                  aria-required="true"
                  aria-invalid={attemptedSubmit && !draft.inspectionStatus}
                >
                  <option value="" disabled>
                    Select one…
                  </option>
                  <option value="PASS">Pass</option>
                  <option value="FAIL">Fail</option>
                  <option value="REWORK">Rework</option>
                  <option value="HOLD">Hold</option>
                  <option value="COMMERCIAL_APPROVED">
                    Commercial Approved
                  </option>
                  <option value="REJECTED">Reject</option>
                </select>
              </Field>
            </div>
            <p className="mt-2 text-[11px] text-stone-500">
              Totals are auto-derived from the defect list above. Choose the
              overall inspection status on the right — your selection is the
              final verdict submitted.
            </p>
          </div>
        </StepCard>

        {/* ---- Step 8: Debit note (Yes/No + comment when Yes) ---- */}
        <StepCard
          stepKey="sDebit"
          index={8}
          title="Debit note"
          subtitle="Raise a debit note against the supplier if the lot has a commercial issue. When you answer Yes, add the reason in the comment."
          done={stepDone.sDebit}
          highlightIncomplete={attemptedSubmit && !stepDone.sDebit}
          sectionRef={sDebitRef}
          variant={layout}
          badge={
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
              Required · 1
            </span>
          }
        >
          <div className="pt-3">
            <div
              className={`rounded-md border p-4 transition-colors ${
                attemptedSubmit && !stepDone.sDebit
                  ? "border-amber-400 bg-amber-50"
                  : "border-stone-200 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-sm font-semibold text-stone-800 flex-1 min-w-[8rem]">
                  Debit note
                  <span className="text-red-500 ml-0.5">*</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        debitNote: "YES",
                        // Keep existing comment if the user already typed
                        // one. If they had picked No earlier we wiped the
                        // comment out — that's still true here because
                        // toggling back to Yes is a fresh intent.
                      })
                    }
                    aria-pressed={draft.debitNote === "YES"}
                    className={`px-3 py-1 text-xs font-semibold rounded border transition-colors ${
                      draft.debitNote === "YES"
                        ? "bg-accept-soft text-accept-deep border-accept-border"
                        : "bg-white text-stone-600 border-stone-300 hover:bg-stone-50"
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({
                        ...draft,
                        debitNote: "NO",
                        // A No answer must not carry a comment. We wipe the
                        // text so a follow-up Yes starts blank and the
                        // API snapshot is unambiguous.
                        debitNoteComment: "",
                      });
                      // Also clear any supporting photos uploaded while
                      // a previous "Yes" was selected — a No answer must
                      // not carry stale binary attachments.
                      setDebitNotePhotos([]);
                    }}
                    aria-pressed={draft.debitNote === "NO"}
                    className={`px-3 py-1 text-xs font-semibold rounded border transition-colors ${
                      draft.debitNote === "NO"
                        ? "bg-reject-soft text-reject-deep border-reject-border"
                        : "bg-white text-stone-600 border-stone-300 hover:bg-stone-50"
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>

              {draft.debitNote === "YES" && (
                <div className="mt-3">
                  <textarea
                    value={draft.debitNoteComment}
                    onChange={(e) =>
                      setDraft({ ...draft, debitNoteComment: e.target.value })
                    }
                    rows={3}
                    placeholder="Reason for raising the debit note — what's the issue, what's the supplier being asked to do?"
                    maxLength={2000}
                    className={`w-full px-3 py-2 border rounded text-sm transition-colors bg-white ${
                      attemptedSubmit &&
                      draft.debitNoteComment.trim().length === 0
                        ? "border-amber-400"
                        : "border-stone-300"
                    }`}
                    aria-required="true"
                    aria-invalid={
                      attemptedSubmit &&
                      draft.debitNoteComment.trim().length === 0
                    }
                  />
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Required when "Yes" is selected. Up to 2,000 characters.
                  </p>
                  {/* Debit-note supporting photos — same compact
                    "+ Add photos" button as the Evaluation checks
                    card, but with no extra field label (the parent
                    already shows "Debit note" + the Yes/No choice
                    and the comment textarea, so a third label here
                    would be redundant). Mandatory: at least one
                    photo is required to mark the step done. */}
                  <div className="mt-3">
                    <EvalPhotoButton
                      photos={debitNotePhotos}
                      onChange={setDebitNotePhotos}
                    />
                  </div>
                </div>
              )}
              {attemptedSubmit &&
                draft.debitNote === "YES" &&
                draft.debitNoteComment.trim().length === 0 && (
                  <p className="text-[11px] text-reject-deep mt-2">
                    Please add a reason for the debit note before submitting.
                  </p>
                )}
              {attemptedSubmit &&
                draft.debitNote === "YES" &&
                debitNotePhotos.length === 0 && (
                  <p className="text-[11px] text-reject-deep mt-2">
                    At least one supporting photo is required when "Yes" is
                    selected.
                  </p>
                )}
              {attemptedSubmit && draft.debitNote === "" && (
                <p className="text-[11px] text-reject-deep mt-2">
                  Please pick Yes or No before submitting.
                </p>
              )}
            </div>
          </div>
        </StepCard>

        {/* ---- Step 9: AQL preview (read-only, never collapses) ---- */}
        <div
          ref={s9Ref}
          id="step-s9"
          data-step="s9"
          className="rounded-xl border border-blue-200 bg-blue-50 shadow-sm overflow-hidden scroll-mt-32"
        >
          <div className="px-5 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex shrink-0 items-center justify-center w-7 h-7 rounded-full bg-blue-200 text-blue-800 text-xs font-bold">
                9
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-blue-900">
                  AQL plan (reference)
                </h2>
                <p className="text-[11px] text-blue-800">
                  Live thresholds from your AQL row — updates as you change it.
                  Your final verdict is the Inspection Status you pick in step
                  8.
                </p>
              </div>
            </div>
          </div>
          <div className="px-5 pb-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-blue-900 border-t border-blue-100 pt-4">
            <Stat label="Code letter" value={aql.codeLetter} />
            <Stat label="Sample size" value={aql.sampleSize} />
            <Stat
              label="Major AC/RE"
              value={`${aql.majorAc} / ${aql.majorRe}`}
            />
            <Stat
              label="Minor AC/RE"
              value={`${aql.minorAc} / ${aql.minorRe}`}
            />
          </div>
          <div className="px-5 pb-4 text-xs text-blue-800">
            Thresholds shown for reference. Critical rejects the lot at RE ={" "}
            {aql.criticalRe}; Major and Minor use their own AC/RE above. The
            inspector's verdict is final.
          </div>
        </div>

        {/* ---- Step 10: Signatures (one canvas per stakeholder) ---- */}
        <StepCard
          stepKey="sSignature"
          index={10}
          title="Signatures"
          subtitle="Any one of the four stakeholders may sign — single-signature submissions are accepted."
          done={stepDone.sSignature}
          highlightIncomplete={attemptedSubmit && !stepDone.sSignature}
          sectionRef={sSignatureRef}
          variant={layout}
          badge={
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                stepDone.sSignature
                  ? "bg-accept-soft text-accept-deep border-accept-border"
                  : attemptedSubmit
                    ? "bg-amber-50 text-amber-800 border-amber-300"
                    : "bg-stone-100 text-stone-700 border-stone-200"
              }`}
            >
              Any 1 of {SIGNATURE_ROLES.length}
            </span>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SIGNATURE_ROLES.map((r) => {
              const value = draft.signatures[r.role];
              return (
                <Field
                  key={r.role}
                  label={r.label}
                  hint="Sign with your mouse, finger, or stylus. Optional — sign if you're one of the four stakeholders."
                >
                  <SignaturePad
                    value={value}
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        signatures: { ...d.signatures, [r.role]: v },
                      }))
                    }
                  />
                  {attemptedSubmit && !value && (
                    <p className="text-[11px] text-stone-500 mt-1">
                      Optional — at least one of the four must sign.
                    </p>
                  )}
                </Field>
              );
            })}
          </div>
        </StepCard>

        {/* ---- Inspector notes (always visible) ---- */}
        <section
          ref={s5Ref /* reuse unused ref safely; not a real step */}
          className="bg-white border border-stone-200 rounded-2xl shadow-sm p-6 scroll-mt-28"
        >
          <h2 className="text-lg font-semibold text-stone-900 mb-1">
            Inspector notes
          </h2>
          <p className="text-sm text-stone-500 mb-4">
            Anything notable about this lot — optional.
          </p>
          <Field label="Notes">
            <textarea
              rows={4}
              value={draft.inspectorNotes}
              onChange={(e) =>
                setDraft({ ...draft, inspectorNotes: e.target.value })
              }
              placeholder="e.g. Lot had minor staining on 3 cartons, supplier agreed to replace."
              className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-base bg-white focus:border-qc focus:ring-2 focus:ring-qc/20 outline-none transition-colors resize-y"
            />
          </Field>
        </section>

        {/* ---- Submit footer (ERP-style: inline, not floating) ---- */}
        {!submitOk && (
          <div
            className={
              isClassic
                ? "sticky bottom-4 z-30 mt-4"
                : "mt-6 pt-5 border-t border-stone-200 flex items-center justify-end gap-4 flex-wrap"
            }
          >
            {isClassic ? (
              <>
                <div
                  className={
                    "border-2 border-qc-strong shadow-xl rounded-2xl p-4 flex items-center gap-4 flex-wrap bg-qc-strong text-qc-on"
                  }
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-sm font-semibold text-qc-on">
                        {canSubmit ? (
                          <span className="flex items-center gap-1.5">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accept text-qc-on text-xs">
                              ✓
                            </span>
                            Ready to submit
                          </span>
                        ) : (
                          <>
                            {requiredTotal - requiredFilledTotal} more required
                            field
                            {requiredTotal - requiredFilledTotal === 1
                              ? ""
                              : "s"}{" "}
                            to go
                          </>
                        )}
                      </span>
                      <span className="text-xs text-qc-on/80 tabular-nums">
                        {requiredFilledTotal} / {requiredTotal} · {overallPct}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-qc-deep rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          canSubmit ? "bg-accept" : "bg-white"
                        }`}
                        style={{ width: `${overallPct}%` }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!canSubmit}
                    className="px-6 h-12 rounded-xl text-base font-semibold bg-white hover:bg-stone-100 text-qc-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                  >
                    {submitting ? "Submitting…" : "Submit inspection"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <a
                  href="/inspections"
                  className="text-sm font-medium text-stone-500 hover:text-stone-700 transition-colors"
                >
                  Cancel
                </a>
                <span className="text-sm text-stone-500 tabular-nums">
                  {requiredTotal - requiredFilledTotal} more required field
                  {requiredTotal - requiredFilledTotal === 1 ? "" : "s"} to go
                </span>
                <span className="text-xs text-stone-400 tabular-nums">
                  {requiredFilledTotal}/{requiredTotal} · {overallPct}%
                </span>
                <div className="w-32 h-1.5 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      canSubmit ? "bg-accept" : "bg-qc"
                    }`}
                    style={{ width: `${overallPct}%` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  className="px-5 h-10 rounded-md text-sm font-semibold bg-qc-strong hover:bg-qc-deep text-qc-on disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? "Submitting…" : "Submit inspection"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-800 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && (
        <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">{hint}</p>
      )}
    </div>
  );
}

/**
 * StepCard — wraps one numbered step of the New Inspection form.
 *
 * Renders a header with a large circular step number, the step title, a
 * one-line subtitle, and a status badge (Required / Optional / X of N
 * fields / or "✓ <selected value>" when complete).
 *
 * The body is **always expanded**. We deliberately do NOT collapse
 * completed steps — collapsing saves vertical space but at the cost of
 * hiding what the user just filled in. For a 9-section form, keeping
 * everything visible is more "top 1" than the gimmicky auto-collapse.
 *
 * Used by both the main column and the sidebar nav. The sidebar reads each
 * step's completion state from `done` and shows a ✓ chip; clicking jumps
 * the main column's scroll position to that step.
 */
function StepCard({
  stepKey,
  index,
  title,
  subtitle,
  done,
  highlightIncomplete,
  badge,
  children,
  sectionRef,
  variant = "modern",
}: {
  stepKey: string;
  index: number;
  title: string;
  subtitle?: string;
  done: boolean;
  highlightIncomplete?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
  sectionRef: React.RefObject<HTMLDivElement>;
  variant?: UiLayout;
}) {
  // Modern = always expanded; the user keeps everything visible because
  //   hiding what they just filled is hostile UX.
  // Classic = collapsible; click the header to expand / collapse. The
  //   section starts expanded if `done` is false (must be visible to fill
  //   in) and collapsed if `done` is true (cleaner scroll target).
  const [open, setOpen] = useState<boolean>(!done);
  const expanded = variant === "modern" ? true : open;

  // ERP-style: small ring-circle indicator (looks like a radio button) on
  // the left of the section title. Modern = neutral palette + flat look;
  // Classic = brand-green palette + collapse chevron.
  const headerCircle =
    variant === "classic"
      ? `shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold transition-colors ${
          done
            ? "bg-accept text-qc-on"
            : highlightIncomplete
              ? "bg-amber-500 text-white"
              : "bg-qc-strong text-qc-on"
        }`
      : `shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-colors ${
          done
            ? "bg-accept text-white"
            : highlightIncomplete
              ? "bg-white text-amber-700 border-2 border-amber-400"
              : "bg-white text-stone-500 border-2 border-stone-300"
        }`;

  const shellClasses =
    variant === "classic"
      ? `rounded-2xl border bg-white shadow-sm overflow-hidden scroll-mt-28 transition-colors ${
          highlightIncomplete && !done
            ? "border-amber-300 ring-2 ring-amber-200"
            : done
              ? "border-accept-border"
              : "border-stone-200"
        }`
      : `rounded-md border bg-white overflow-hidden scroll-mt-28 transition-colors ${
          highlightIncomplete && !done
            ? "border-amber-300 ring-1 ring-amber-200"
            : "border-stone-200"
        }`;

  const headerClasses =
    variant === "classic"
      ? `flex items-start gap-4 px-6 py-4 border-b transition-colors cursor-pointer select-none ${
          expanded
            ? "border-stone-100 bg-qc/5"
            : "border-transparent hover:bg-stone-50"
        }`
      : "flex items-center gap-3 px-5 py-3 border-b bg-card border-card-border text-card-on";

  return (
    <section
      ref={sectionRef}
      id={`step-${stepKey}`}
      data-step={stepKey}
      data-done={done ? "1" : "0"}
      className={shellClasses}
    >
      <header
        className={headerClasses}
        onClick={variant === "classic" ? () => setOpen((o) => !o) : undefined}
        role={variant === "classic" ? "button" : undefined}
        tabIndex={variant === "classic" ? 0 : undefined}
        aria-expanded={variant === "classic" ? expanded : undefined}
        onKeyDown={
          variant === "classic"
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen((o) => !o);
                }
              }
            : undefined
        }
      >
        <span className={headerCircle} aria-hidden="true">
          {done ? "✓" : index}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              className={
                variant === "classic"
                  ? "text-base font-semibold text-stone-900"
                  : "text-sm font-semibold text-card-on"
              }
            >
              {title}
            </h2>
            {badge}
          </div>
          {subtitle && variant === "classic" && (
            <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        {variant === "classic" && (
          <span
            aria-hidden="true"
            className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-stone-400 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        )}
      </header>
      {expanded && (
        <div className={variant === "classic" ? "px-6 py-6" : "px-5 py-5"}>
          {children}
        </div>
      )}
    </section>
  );
}

function InfoStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | null;
  accent: "qc" | "green" | "red";
}) {
  const accentClasses =
    accent === "green"
      ? "border-accept bg-accept-soft text-accept-deep"
      : accent === "red"
        ? "border-reject bg-reject-soft text-reject-deep"
        : "border-qc/40 bg-white text-stone-900";
  return (
    <div
      className={`rounded-md border px-2.5 py-1.5 text-center ${accentClasses}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70 leading-tight">
        {label}
      </div>
      <div className="text-base font-bold tabular-nums leading-tight mt-0.5">
        {value === null ? "—" : value.toLocaleString()}
      </div>
    </div>
  );
}

/**
 * Compact one-line stat used inline next to a field.
 * Mobile: horizontal (label | value). Desktop: vertical stack of three.
 */
function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | null;
  accent: "qc" | "green" | "red";
}) {
  const accentClasses =
    accent === "green"
      ? "border-accept bg-accept-soft text-accept-deep"
      : accent === "red"
        ? "border-reject bg-reject-soft text-reject-deep"
        : "border-qc/40 bg-white text-stone-900";
  return (
    <div
      className={`inline-flex md:flex items-center md:items-center justify-between md:justify-start gap-1.5 rounded border px-2 py-1 text-[11px] font-medium ${accentClasses}`}
    >
      <span className="uppercase tracking-wide opacity-75 leading-none">
        {label}
      </span>
      <span className="font-bold tabular-nums leading-none">
        {value === null ? "—" : value.toLocaleString()}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-blue-700">{label}</div>
      <div className="font-mono text-base font-medium">{value}</div>
    </div>
  );
}

/**
 * Compact photo uploader for the Evaluation-checks card.
 *
 * Same binary upload + per-photo list as PhotoUploader, but without the
 * outer `<Field label="…">` wrapper. The Evaluation card already prints
 * the question label next to the Yes/No buttons, so wrapping the photo
 * button in another field produces a duplicate label like "Inline
 * Inspection Done photos" that looks redundant and clutters the cell.
 *
 * No `required` prop either — the Evaluation card gates submit on the
 * count of attached photos in `stepDone.sEval`, so a per-photo-uploader
 * "required" caption would just be noise.
 */
function EvalPhotoButton({
  photos,
  onChange,
}: {
  photos: UploadedPhoto[];
  onChange: (next: UploadedPhoto[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const next: UploadedPhoto[] = [...photos];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) {
        setError(`"${f.name}" is not an image (${f.type || "unknown type"})`);
        continue;
      }
      const fd = new FormData();
      fd.append("file", f);
      try {
        const res = await clientApiFetch("/uploads/photo", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const txt = await res.text();
          setError(
            `Upload failed for "${f.name}" (${res.status}): ${txt.slice(0, 160)}`,
          );
          continue;
        }
        const json = (await res.json()) as {
          url?: string;
          filename?: string;
          size?: number;
          mimeType?: string;
        };
        if (!json.url) {
          setError(`Upload failed for "${f.name}" — no URL in response`);
          continue;
        }
        next.push({
          url: json.url,
          filename: json.filename || f.name,
          size: json.size ?? f.size,
          mimeType: json.mimeType || f.type,
        });
      } catch (e: any) {
        setError(
          `Network error uploading "${f.name}": ${e?.message ?? "unknown"}`,
        );
      }
    }
    onChange(next);
    setUploading(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="inline-flex items-center gap-2 px-3 py-1.5 border border-dashed border-stone-300 rounded text-xs font-medium cursor-pointer w-fit hover:bg-stone-50">
        <span>{uploading ? "Uploading…" : "+ Add photos"}</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>
      {error && (
        <div className="text-[11px] bg-reject-soft border border-reject-border text-reject-deep px-2 py-1 rounded">
          {error}
        </div>
      )}
      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mt-1">
          {photos.map((p, i) => (
            <li
              key={p.url}
              className="inline-flex items-center gap-1.5 border border-stone-300 bg-white rounded px-2 py-1 text-[11px]"
            >
              <a
                href={`/api/backend${p.url}`}
                target="_blank"
                rel="noreferrer"
                className="text-qc-deep hover:underline truncate max-w-[180px]"
                title={p.filename}
              >
                {p.filename}
              </a>
              <span className="text-stone-400">
                {(p.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={() => onChange(photos.filter((_, idx) => idx !== i))}
                className="text-reject-deep hover:bg-reject-soft rounded px-1 leading-none"
                aria-label={`Remove ${p.filename}`}
                title="Remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Multi-file photo uploader used by Step 7 (carton photos).
 *
 * Each chosen file is POSTed to `/uploads/photo` and the server returns a
 * URL we keep in local state. On submit the parent flattens these into the
 * inspection payload's `photos[]` with the appropriate `kind`.
 *
 * Errors (non-image files, network failures, etc.) are shown inline without
 * dropping the rest of the batch — the user can retry just the failed one.
 */
function PhotoUploader({
  label,
  required,
  photos,
  onChange,
  hint,
  highlightMissing,
}: {
  label: string;
  required?: boolean;
  photos: UploadedPhoto[];
  onChange: (next: UploadedPhoto[]) => void;
  hint?: string;
  highlightMissing?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const next: UploadedPhoto[] = [...photos];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) {
        setError(`"${f.name}" is not an image (${f.type || "unknown type"})`);
        continue;
      }
      const fd = new FormData();
      fd.append("file", f);
      try {
        const res = await clientApiFetch("/uploads/photo", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const txt = await res.text();
          setError(
            `Upload failed for "${f.name}" (${res.status}): ${txt.slice(0, 160)}`,
          );
          continue;
        }
        const json = (await res.json()) as {
          url?: string;
          filename?: string;
          size?: number;
          mimeType?: string;
        };
        if (!json.url) {
          setError(`Upload failed for "${f.name}" — no URL in response`);
          continue;
        }
        next.push({
          url: json.url,
          filename: json.filename || f.name,
          size: json.size ?? f.size,
          mimeType: json.mimeType || f.type,
        });
      } catch (e: any) {
        setError(
          `Network error uploading "${f.name}": ${e?.message ?? "unknown"}`,
        );
      }
    }
    onChange(next);
    setUploading(false);
  }

  return (
    <Field label={label} required={required}>
      <div className="flex flex-col gap-2">
        <label
          className={`inline-flex items-center gap-2 px-3 py-1.5 border border-dashed rounded text-xs font-medium cursor-pointer w-fit ${
            highlightMissing && photos.length === 0
              ? "border-reject-border bg-reject-soft text-reject-deep hover:bg-reject-soft"
              : "border-stone-300 hover:bg-stone-50"
          }`}
        >
          <span>{uploading ? "Uploading…" : "+ Add photos"}</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
        </label>
        {hint && <p className="text-[11px] text-stone-500">{hint}</p>}
        {error && (
          <div className="text-[11px] bg-reject-soft border border-reject-border text-reject-deep px-2 py-1 rounded">
            {error}
          </div>
        )}
        {photos.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mt-1">
            {photos.map((p, i) => (
              <li
                key={p.url}
                className="inline-flex items-center gap-1.5 border border-stone-300 bg-white rounded px-2 py-1 text-[11px]"
              >
                <a
                  href={`/api/backend${p.url}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-qc-deep hover:underline truncate max-w-[180px]"
                  title={p.filename}
                >
                  {p.filename}
                </a>
                <span className="text-stone-400">
                  {(p.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={() => onChange(photos.filter((_, idx) => idx !== i))}
                  className="text-reject-deep hover:bg-reject-soft rounded px-1 leading-none"
                  aria-label={`Remove ${p.filename}`}
                  title="Remove"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {required && photos.length === 0 && (
          <p className="text-[11px] text-reject-deep font-medium flex items-center gap-1">
            <span aria-hidden="true">⚠</span>
            At least one photo required before you can submit.
          </p>
        )}
      </div>
    </Field>
  );
}

/**
 * SignaturePad — small HTML5-canvas signature capture used by Step 10
 * (Inspector signature). Renders a 600x200 drawing surface (scaled to
 * the surrounding container width via CSS) and a Clear button. The
 * captured stroke is serialised to a PNG data URL via toDataURL() and
 * pushed up via onChange. Empty string means "no signature yet" — the
 * parent form gates submit on a non-empty value.
 *
 * Mouse + touch + pen are all handled through pointer events so it
 * works on desktop browsers and on tablets/phones without extra
 * listeners. We also block the default page scroll while drawing so
 * the form doesn't jump when the user drags down past the canvas
 * bottom.
 */
function SignaturePad({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (dataUrl: string) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  // Set up the canvas backing store at the natural 600x200 size with
  // a 2x device-pixel-ratio scale so the strokes stay crisp on hi-dpi
  // displays. Called once on mount; the ref stays stable.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    c.width = Math.round(600 * ratio);
    c.height = Math.round(200 * ratio);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#0f172a"; // slate-900 — readable ink colour
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 600, 200);
  }, []);

  // Re-hydrate the canvas with the existing signature if the parent
  // re-mounts us with a value (e.g. after HMR or page reload). Without
  // this the canvas would be blank even though `value` is non-empty.
  useEffect(() => {
    if (!value) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      // Cover the previous fill so a new stroke doesn't paint over
      // an old saved image.
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, 600, 200);
    };
    img.src = value;
  }, []); // intentionally only on mount — value is the source of truth

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 600,
      y: ((e.clientY - rect.top) / rect.height) * 200,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    c.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = pointerPos(e);
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const cur = pointerPos(e);
    const last = lastRef.current;
    if (!last) {
      lastRef.current = cur;
      return;
    }
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(cur.x, cur.y);
    ctx.stroke();
    lastRef.current = cur;
  }
  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    const c = canvasRef.current;
    if (!c) return;
    try {
      c.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    const dataUrl = c.toDataURL("image/png");
    onChange(dataUrl);
  }
  function clear() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.save();
    // Reset the transform that the mount-time scale() applied so the
    // fillRect covers the whole backing store, not just a corner.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    // Restore the device-pixel-ratio scale + ink style for the next
    // stroke so the user doesn't have to wait for the mount effect
    // to fire again.
    const ratio =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#0f172a";
    ctx.restore();
    onChange("");
  }

  return (
    <div className={className}>
      <div className="rounded-lg border border-stone-300 bg-white shadow-inner overflow-hidden">
        <canvas
          ref={canvasRef}
          className="block w-full h-[200px] touch-none cursor-crosshair"
          style={{ width: "100%", height: 200 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
          aria-label="Signature pad — draw your signature with mouse, finger, or pen"
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-stone-500">
          {value
            ? "Signature captured. Draw again to replace it."
            : "Sign in the box above using your mouse, finger, or stylus."}
        </span>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-stone-600 hover:text-stone-800 border border-stone-300 rounded hover:bg-stone-50 transition-colors"
          aria-label="Clear signature"
        >
          <span aria-hidden="true">↻</span> Clear
        </button>
      </div>
    </div>
  );
}
