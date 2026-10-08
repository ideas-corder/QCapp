'use client';
import { useState } from 'react';
import { clientApiFetch } from '@/lib/api-client';

type Recipient = {
  name?: string;
  email: string;
  role: 'TO' | 'CC' | 'BCC';
};

type EmailEventRow = {
  id: string;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  subject: string;
  recipientSummary: string;
  emlPath?: string | null;
  createdAt: string;
  sentAt?: string | null;
  errorMessage?: string | null;
};

/**
 * "Email detail report" dialog + button for the inspection detail
 * page. Opens a modal where the admin picks recipients (defaults to
 * a single blank entry), edits the subject and body, then submits.
 * After the API returns, the dialog surfaces the email_event status
 * (SENT / FAILED / .eml drop only) and refreshes the audit trail so
 * the new row shows up.
 */
export default function EmailReportButton({
  inspectionId,
  poNumber,
  inspectorName,
}: {
  inspectionId: string;
  poNumber: string | null;
  inspectorName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<EmailEventRow | null>(null);

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'TO' | 'CC' | 'BCC'>('TO');
  const [subject, setSubject] = useState(
    `QC Inspection Detail Report — PO ${poNumber ?? inspectionId.slice(0, 8)}`,
  );
  const [body, setBody] = useState(
    `Dear Supplier,\n\nPlease find attached the detail submission record for inspection ${inspectionId.slice(0, 8)} (PO ${poNumber ?? '—'}).\n\nThe attached PDF contains the full audit record: identification, lot sampling, defect detail, Step 6 evaluation checks, Step 8 debit note, and Step 10 multi-signer signatures.\n\nIf you have any questions, please contact ${inspectorName ?? 'the QC inspector'} directly.\n\nBest regards,\nQC Inspector`,
  );

  function addRecipient() {
    const email = newEmail.trim();
    if (!email || !email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (recipients.some((r) => r.email.toLowerCase() === email.toLowerCase())) {
      setError('Already in the recipient list.');
      return;
    }
    setRecipients([...recipients, { email, name: newName.trim() || undefined, role: newRole }]);
    setNewEmail('');
    setNewName('');
    setError(null);
  }

  function removeRecipient(idx: number) {
    setRecipients(recipients.filter((_, i) => i !== idx));
  }

  async function submit() {
    setError(null);
    if (recipients.length === 0) {
      setError('Add at least one recipient.');
      return;
    }
    const toCount = recipients.filter((r) => r.role === 'TO').length;
    if (toCount === 0) {
      setError('At least one recipient must be in the "To" line.');
      return;
    }
    setSubmitting(true);
    try {
      // Route through the same-origin /api/backend proxy so the
      // httpOnly qc_access cookie is forwarded as Authorization
      // server-side. The proxy lives at apps/web/src/app/api/backend
      // and handles 401-refresh-then-retry automatically.
      const r = await clientApiFetch(`/reports/inspections/${inspectionId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients, subject, body }),
        credentials: 'same-origin',
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || `HTTP ${r.status}`);
      }
      const event = (await r.json()) as EmailEventRow;
      setLastEvent(event);
      // Refresh the audit trail on the page so the new row appears.
      if (typeof window !== 'undefined') window.location.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-white border border-qc-strong text-qc-deep hover:bg-qc-soft px-3 py-2 rounded text-sm"
        data-testid="open-email-dialog"
      >
        Email detail report
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <h2 className="font-semibold text-lg">Email detail report</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-stone-400 hover:text-stone-700 text-xl leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-stone-600">
                A fresh detail submission report PDF will be generated and attached to
                the email. The audit trail below records who received this report and when.
              </p>

              {/* Recipients */}
              <div>
                <label className="block text-xs text-stone-500 mb-1 font-medium">
                  Recipients
                </label>
                {recipients.length > 0 && (
                  <ul className="space-y-1 mb-2">
                    {recipients.map((r, idx) => (
                      <li
                        key={`${r.email}-${idx}`}
                        className="flex items-center justify-between gap-2 bg-stone-50 border border-stone-200 rounded px-2 py-1 text-sm"
                      >
                        <span className="truncate">
                          <span className="font-medium">{r.role}</span>
                          <span className="mx-1 text-stone-400">·</span>
                          <span className="text-stone-700">
                            {r.name ? `${r.name} ` : ''}
                            <span className="font-mono text-xs">{r.email}</span>
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeRecipient(idx)}
                          className="text-stone-400 hover:text-fail text-xs"
                          aria-label="Remove recipient"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2 flex-wrap items-end">
                  <div className="flex-1 min-w-[180px]">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Name (optional)"
                      className="w-full px-2 py-1.5 border rounded text-sm"
                    />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addRecipient();
                        }
                      }}
                      placeholder="email@example.com"
                      className="w-full px-2 py-1.5 border rounded text-sm"
                    />
                  </div>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as 'TO' | 'CC' | 'BCC')}
                    className="px-2 py-1.5 border rounded text-sm"
                  >
                    <option value="TO">To</option>
                    <option value="CC">Cc</option>
                    <option value="BCC">Bcc</option>
                  </select>
                  <button
                    type="button"
                    onClick={addRecipient}
                    className="px-3 py-1.5 text-sm rounded border border-stone-300 hover:bg-stone-50"
                  >
                    Add
                  </button>
                </div>
                {recipients.length === 0 && (
                  <p className="text-xs text-amber-700 mt-2">
                    Add at least one recipient before sending.
                  </p>
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs text-stone-500 mb-1 font-medium">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-2 py-1.5 border rounded text-sm"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs text-stone-500 mb-1 font-medium">
                  Body
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={8}
                  className="w-full px-2 py-1.5 border rounded text-sm font-mono"
                />
              </div>

              {/* Last result */}
              {lastEvent && (
                <div
                  className={`rounded p-3 text-sm border ${
                    lastEvent.status === 'SENT'
                      ? 'bg-pass-soft border-pass/30 text-pass-deep'
                      : lastEvent.status === 'FAILED'
                        ? 'bg-amber-50 border-amber-300 text-amber-900'
                        : 'bg-stone-50 border-stone-200 text-stone-700'
                  }`}
                >
                  <strong className="block">
                    {lastEvent.status === 'SENT'
                      ? 'Email sent.'
                      : 'Email queued.'}
                  </strong>
                  {lastEvent.status === 'FAILED' && (
                    <p className="text-xs mt-1">
                      {lastEvent.errorMessage ??
                        'SMTP relay is not configured; the message was kept in the .eml drop directory for the audit trail.'}
                    </p>
                  )}
                  {lastEvent.emlPath && (
                    <p className="text-xs mt-1 font-mono text-stone-500 break-all">
                      .eml: {lastEvent.emlPath}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="rounded p-3 text-sm border bg-fail-soft border-fail/30 text-fail-deep">
                  {error}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-sm rounded border border-stone-300 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || recipients.length === 0}
                className="px-3 py-1.5 text-sm rounded bg-qc-600 text-white hover:bg-qc-700 disabled:opacity-40"
              >
                {submitting ? 'Sending…' : 'Send email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
