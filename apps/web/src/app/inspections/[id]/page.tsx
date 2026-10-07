import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { calculateSampling } from '@/lib/aql';
import EmailReportButton from './EmailReportButton';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

type AuditReport = {
  id: string;
  kind: 'AUTO_SUBMIT' | 'MANUAL_DOWNLOAD' | 'EMAIL_ATTACHMENT';
  sha256: string;
  byteSize: number;
  pageCount: number;
  storagePath: string;
  createdAt: string;
  generatedBy?: string | null;
};

type AuditEmailEvent = {
  id: string;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  subject: string;
  recipientSummary: string;
  emlPath?: string | null;
  createdAt: string;
  sentAt?: string | null;
  errorMessage?: string | null;
};

type InspectionPhoto = {
  id?: string;
  url: string;
  caption?: string | null;
  kind?: string | null;
  severity?: string | null;
};

const PHOTO_KIND_LABELS: Record<string, string> = {
  INSPECTION: 'Inspection evidence',
  CARTON_UPLOAD: 'Cartons on arrival',
  CARTON_INSPECT: 'Cartons inspected',
  EVAL_INLINE_INSPECTION_DONE: 'Inline inspection evidence',
  EVAL_PP_SAMPLE_APPROVED: 'PP sample approval evidence',
  EVAL_IC_AVAILABLE: 'Inspection certificate evidence',
  EVAL_BARCODE: 'Barcode evidence',
  EVAL_CARE_LABEL: 'Care-label evidence',
  EVAL_PACKING_LIST_AVAILABLE: 'Packing-list evidence',
  EVAL_PO_SAME: 'Purchase-order evidence',
  EVAL_ATTACH_MEASUREMENT_SHEET: 'Measurement-sheet evidence',
  EVAL_STORAGE_OK: 'Storage-condition evidence',
  EVAL_TEST_REPORT_AVAILABLE: 'Test-report evidence',
  DEFECT_MAJOR: 'Major defect evidence',
  DEFECT_MINOR: 'Minor defect evidence',
};

function photoLabel(photo: InspectionPhoto, index: number): string {
  const caption = photo.caption?.trim();
  if (caption) return caption;
  const base =
    (photo.kind && PHOTO_KIND_LABELS[photo.kind]) ||
    (photo.severity ? `${photo.severity.toLowerCase()} defect evidence` : 'Inspection evidence');
  return `${base} - Photo ${index + 1}`;
}

async function fetchInspection(id: string) {
  const token = cookies().get('qc_access')?.value;
  if (!token) return null;
  const res = await fetch(`${API}/inspections/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchAudit(id: string) {
  const token = cookies().get('qc_access')?.value;
  if (!token) return { reports: [], emailEvents: [] };
  const res = await fetch(`${API}/reports/inspections/${id}/audit`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return { reports: [], emailEvents: [] };
  return res.json() as Promise<{
    reports: AuditReport[];
    emailEvents: AuditEmailEvent[];
  }>;
}

export default async function InspectionDetail({
  params,
}: {
  params: { id: string };
}) {
  if (!cookies().get('qc_access')?.value) redirect('/login?expired=1');
  const i = await fetchInspection(params.id);
  if (!i) notFound();
  const audit = await fetchAudit(params.id);
  const photos = (i.photos ?? []) as InspectionPhoto[];
  const generalPhotos = photos.filter(
    (photo) => photo.kind !== 'EVAL_DEBIT_NOTE',
  );
  const debitPhotoRows = photos.filter(
    (photo) => photo.kind === 'EVAL_DEBIT_NOTE',
  );
  const debitSnapshotUrls = (i.debitNote?.photoUrls ?? []) as string[];
  const debitPhotoMap = new Map<string, InspectionPhoto>();
  for (const photo of debitPhotoRows) debitPhotoMap.set(photo.url, photo);
  for (const url of debitSnapshotUrls) {
    if (!debitPhotoMap.has(url)) debitPhotoMap.set(url, { url });
  }
  const debitPhotos = Array.from(debitPhotoMap.values());
  const debitAnswer = i.debitNote?.answer ?? '';
  const debitComment = String(i.debitNote?.comment ?? '').trim();

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Inspection {i.id.slice(0, 8)}</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <a
            href={`/api/backend/reports/inspections/${i.id}/pdf`}
            className="bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 px-3 py-2 rounded text-sm"
          >
            Download summary PDF
          </a>
          <a
            href={`/api/backend/reports/inspections/${i.id}/detail?regenerate=1`}
            className="bg-qc-600 hover:bg-qc-700 text-white px-3 py-2 rounded text-sm"
          >
            Download detail report
          </a>
          <EmailReportButton
            inspectionId={i.id}
            poNumber={i.poNumber ?? null}
            inspectorName={i.inspectorName ?? i.inspector?.fullName ?? null}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <h3 className="text-xs uppercase text-stone-500 mb-2">Identification</h3>
          <Row label="PO" value={i.poNumber || '—'} />
          <Row label="Item" value={i.itemNumber || '—'} />
          <Row label="Description" value={i.itemDescription || '—'} />
          <Row label="Category" value={i.category?.name ?? '—'} />
          <Row label="Supplier" value={i.supplier?.name ?? '—'} />
          <Row label="Inspector" value={i.inspectorName || i.inspector?.fullName || '—'} />
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <h3 className="text-xs uppercase text-stone-500 mb-2">Sampling</h3>
          <Row
            label="AQL master"
            value={
              i.aqlMaster
                ? `${i.aqlMaster.description} (lot ${i.aqlMaster.minQty}–${i.aqlMaster.maxQty})`
                : '—'
            }
          />
          <Row label="Code letter" value={i.codeLetter || '—'} />
          <Row label="Sample size" value={String(i.sampleSize)} />
          {(() => {
            const acRe = calculateSampling(Number(i.sampleSize) || 0);
            return (
              <Row
                label="AC/RE"
                value={`C ${acRe.criticalAc}/${acRe.criticalRe} · M ${acRe.majorAc}/${acRe.majorRe} · m ${acRe.minorAc}/${acRe.minorRe}`}
              />
            );
          })()}
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <h3 className="text-xs uppercase text-stone-500 mb-2">Outcome</h3>
          <div
            className={`text-2xl font-bold mb-3 ${
              i.overallResult === 'PASS'
                ? 'text-pass'
                : i.overallResult === 'REWORK' || i.overallResult === 'HOLD'
                ? 'text-rework'
                : i.overallResult === 'REJECTED'
                ? 'text-orange-900'
                : i.overallResult === 'FAIL'
                ? 'text-fail'
                : 'text-pending'
            }`}
          >
            {i.overallResult}
          </div>
          <Row label="Critical" value={String(i.totalCritical)} />
          <Row label="Major" value={String(i.totalMajor)} />
          <Row label="Minor" value={String(i.totalMinor)} />
          <Row label="Sync status" value={i.syncStatus} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="bg-white rounded-xl border border-stone-200 p-4">
          <h3 className="font-semibold mb-3">Defects</h3>
          {i.defects?.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {i.defects.map((d: any) => (
                <li key={d.id} className="border-b last:border-b-0 py-1">
                  <span className="font-mono text-xs mr-2">[{d.severity}]</span>
                  {d.description} <span className="text-stone-400">× {d.quantity}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-stone-400 text-sm">None recorded</div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-stone-200 p-4 md:col-span-2">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-semibold">Debit note</h3>
            <span
              className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold ${
                debitAnswer === 'YES'
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : debitAnswer === 'NO'
                    ? 'bg-accept-soft text-accept-deep border-accept-border'
                    : 'bg-stone-100 text-stone-600 border-stone-200'
              }`}
            >
              {debitAnswer === 'YES'
                ? 'Raised: Yes'
                : debitAnswer === 'NO'
                  ? 'Raised: No'
                  : 'Not specified'}
            </span>
          </div>

          <div className="rounded-md border border-stone-200 bg-stone-50 p-3 mb-3">
            <div className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-1">
              Reason
            </div>
            <p className="text-sm text-stone-800 whitespace-pre-wrap">
              {debitComment || 'No debit-note reason provided.'}
            </p>
          </div>

          {debitPhotos.length > 0 ? (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-stone-500 mb-2">
                Supporting evidence ({debitPhotos.length})
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {debitPhotos.map((photo, index) => {
                  const label = photo.caption?.trim() || `Debit note evidence - Photo ${index + 1}`;
                  return (
                    <a
                      key={photo.id ?? photo.url}
                      href={photo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group rounded-md overflow-hidden border border-stone-200 bg-white hover:border-qc-400 transition-colors"
                    >
                      <div className="aspect-square bg-stone-100 overflow-hidden">
                        <img
                          src={photo.url}
                          alt={label}
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                        />
                      </div>
                      <div className="px-2 py-1.5 text-xs font-medium text-stone-700">
                        {label}
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-sm text-stone-400">No supporting photos.</div>
          )}
        </section>

        {generalPhotos.length > 0 && (
          <section className="bg-white rounded-xl border border-stone-200 p-4 md:col-span-2">
            <h3 className="font-semibold mb-3">Photos</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {generalPhotos.map((photo, index) => {
                const label = photoLabel(photo, index);
                return (
                  <a
                    key={photo.id ?? photo.url}
                    href={photo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-md overflow-hidden border border-stone-200 bg-white hover:border-qc-400 transition-colors"
                  >
                    <div className="aspect-square bg-stone-100 overflow-hidden">
                      <img
                        src={photo.url}
                        alt={label}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                      />
                    </div>
                    <div className="px-2 py-1.5 text-xs font-medium text-stone-700">
                      {label}
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}

        {i.inspectorNotes && (
          <section className="bg-white rounded-xl border border-stone-200 p-4 md:col-span-2">
            <h3 className="font-semibold mb-2">Inspector notes</h3>
            <p className="text-sm whitespace-pre-wrap">{i.inspectorNotes}</p>
          </section>
        )}

        {((i.signatures && i.signatures.length > 0) || i.signatureBase64) && (
          <section className="bg-white rounded-xl border border-stone-200 p-4 md:col-span-2">
            <h3 className="font-semibold mb-3">Signatures</h3>
            {i.signatures && i.signatures.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {i.signatures.map(
                  (s: { role: string; label: string; dataUrl: string; signedAt?: string }) => (
                    <div
                      key={s.role}
                      className="rounded-md border border-stone-200 p-2"
                    >
                      <div className="text-xs font-medium text-stone-600 mb-1">
                        {s.label}
                        {s.signedAt && (
                          <span className="ml-2 text-stone-400 font-normal">
                            {new Date(s.signedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <img
                        src={s.dataUrl}
                        alt={s.label}
                        className="border max-h-32 bg-white w-full object-contain"
                      />
                    </div>
                  ),
                )}
              </div>
            ) : (
              <img
                src={i.signatureBase64}
                alt="Inspector signature"
                className="border max-h-32 bg-white"
              />
            )}
          </section>
        )}
      </div>

      {/* ─── Detail submission report — record / audit / email ─── */}
      <section className="bg-white rounded-xl border border-stone-200 p-4 mt-6">
        <h3 className="font-semibold mb-3">Detail submission report — record / audit / email</h3>
        <p className="text-sm text-stone-600 mb-3">
          A complete PDF report is auto-archived the moment this inspection is submitted,
          and a fresh PDF is generated every time the report is emailed. The audit trail
          below is the source of truth for who got the report and when.
        </p>

        {/* Reports list */}
        <div className="mb-4">
          <h4 className="text-xs uppercase text-stone-500 mb-2 font-medium">Reports</h4>
          {audit.reports.length === 0 ? (
            <div className="text-sm text-stone-400">
              No reports yet — the next time the detail page is opened, an auto-archive
              copy will be generated.
            </div>
          ) : (
            <ul className="divide-y border border-stone-200 rounded">
              {audit.reports.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          r.kind === 'AUTO_SUBMIT'
                            ? 'bg-stone-100 text-stone-700'
                            : r.kind === 'EMAIL_ATTACHMENT'
                              ? 'bg-qc-100 text-qc-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {r.kind === 'AUTO_SUBMIT'
                          ? 'Auto-archive'
                          : r.kind === 'EMAIL_ATTACHMENT'
                            ? 'Email attachment'
                            : 'Manual download'}
                      </span>
                      <span className="text-stone-700">
                        {r.pageCount} page{r.pageCount === 1 ? '' : 's'} · {Math.round(r.byteSize / 1024)} KB
                      </span>
                    </div>
                    <div className="text-xs text-stone-500 font-mono truncate">
                      sha256: {r.sha256.slice(0, 16)}…
                    </div>
                    <div className="text-xs text-stone-400">
                      {new Date(r.createdAt).toLocaleString()}
                      {r.generatedBy && ` · generated by ${r.generatedBy.slice(0, 8)}`}
                    </div>
                  </div>
                  <a
                    href={`/api/backend/reports/${r.id}/pdf`}
                    className="text-qc-600 hover:underline text-xs whitespace-nowrap"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Email events */}
        <div>
          <h4 className="text-xs uppercase text-stone-500 mb-2 font-medium">Emails sent</h4>
          {audit.emailEvents.length === 0 ? (
            <div className="text-sm text-stone-400">
              No emails sent yet. Use the &ldquo;Email detail report&rdquo; button above to send
              the report to the supplier or other stakeholders.
            </div>
          ) : (
            <ul className="divide-y border border-stone-200 rounded">
              {audit.emailEvents.map((e) => (
                <li key={e.id} className="px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        e.status === 'SENT'
                          ? 'bg-pass-soft text-pass-deep'
                          : e.status === 'FAILED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-stone-100 text-stone-700'
                      }`}
                    >
                      {e.status === 'SENT'
                        ? 'Sent'
                        : e.status === 'FAILED'
                          ? 'Queued (.eml drop)'
                          : 'Queued'}
                    </span>
                    <span className="text-stone-700 truncate">{e.subject}</span>
                  </div>
                  <div className="text-xs text-stone-500">
                    To: <span className="font-mono">{e.recipientSummary}</span>
                  </div>
                  <div className="text-xs text-stone-400">
                    {new Date(e.createdAt).toLocaleString()}
                    {e.sentAt && ` · delivered ${new Date(e.sentAt).toLocaleString()}`}
                  </div>
                  {e.emlPath && (
                    <div className="text-xs text-stone-400 font-mono truncate mt-0.5">
                      .eml: {e.emlPath}
                    </div>
                  )}
                  {e.errorMessage && (
                    <div className="text-xs text-amber-700 mt-0.5">{e.errorMessage}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="mt-6">
        <Link href="/inspections" className="text-qc-600 hover:underline text-sm">
          ← Back to inspections
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm py-0.5">
      <span className="text-stone-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
