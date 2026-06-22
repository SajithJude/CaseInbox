"use client";

import * as React from "react";
import { Button, Textarea, Spinner } from "@/components/ui";
import { CategoryBadge } from "@/components/CategoryBadge";
import { SeverityMeter } from "@/components/SeverityMeter";
import { AiNotice } from "@/components/AiNotice";
import { formatDateTime } from "@/lib/format";
import type { Classification, EmailRecord } from "@/lib/types";

interface DrawerData {
  email: EmailRecord;
  classification: Classification | null;
  safeHtml: string;
  flagged: boolean;
  note: string | null;
}

export function EmailDrawer({
  emailId,
  onClose,
  onFlagChange,
}: {
  emailId: string | null;
  onClose: () => void;
  onFlagChange?: (emailId: string, flagged: boolean) => void;
}) {
  const [data, setData] = React.useState<DrawerData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [flagged, setFlagged] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [savingFlag, setSavingFlag] = React.useState(false);

  React.useEffect(() => {
    if (!emailId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setNote("");
    fetch(`/api/emails/${emailId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Failed to load message");
        return body as DrawerData;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
        setFlagged(Boolean(body.flagged));
        setNote(body.note ?? "");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load message");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [emailId]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (emailId) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [emailId, onClose]);

  async function toggleFlag() {
    if (!emailId) return;
    setSavingFlag(true);
    try {
      if (flagged) {
        const res = await fetch("/api/case", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email_id: emailId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || "Failed to unflag");
        }
        setFlagged(false);
        onFlagChange?.(emailId, false);
      } else {
        const res = await fetch("/api/case", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email_id: emailId, note: note.trim() || undefined }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || "Failed to flag");
        }
        setFlagged(true);
        onFlagChange?.(emailId, true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update flag");
    } finally {
      setSavingFlag(false);
    }
  }

  const open = Boolean(emailId);
  const email = data?.email;
  const classification = data?.classification ?? null;

  return (
    <div
      className={open ? "fixed inset-0 z-40" : "pointer-events-none fixed inset-0 z-40"}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-slate-900/30 transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Email details"
        className={`absolute right-0 top-0 flex h-full w-full max-w-2xl transform flex-col bg-white shadow-xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Message detail</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Spinner /> Loading message…
            </div>
          )}

          {error && !loading && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {email && !loading && (
            <div className="space-y-5">
              {/* (a) Header block — verbatim */}
              <section className="rounded-lg border border-slate-200 bg-slate-50">
                <div className="border-b border-slate-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Original message — preserved as received
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-4 py-3 font-mono text-xs text-slate-700">
                  <dt className="text-slate-500">From</dt>
                  <dd className="break-words">{email.from_addr || "—"}</dd>
                  <dt className="text-slate-500">To</dt>
                  <dd className="break-words">{email.to_addrs || "—"}</dd>
                  <dt className="text-slate-500">Cc</dt>
                  <dd className="break-words">{email.cc_addrs || "—"}</dd>
                  <dt className="text-slate-500">Date</dt>
                  <dd className="break-words">{formatDateTime(email.sent_at)}</dd>
                  <dt className="text-slate-500">Subject</dt>
                  <dd className="break-words">{email.subject || "(no subject)"}</dd>
                  <dt className="text-slate-500">Message-ID</dt>
                  <dd className="break-words">{email.gmail_message_id}</dd>
                </dl>
              </section>

              {/* (b) Body — verbatim */}
              <section>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Body
                </div>
                {data && data.safeHtml ? (
                  <div
                    className="prose prose-sm max-w-none rounded-lg border border-slate-200 bg-white p-4 text-slate-800"
                    // safeHtml is sanitized server-side via sanitizeEmailHtml.
                    dangerouslySetInnerHTML={{ __html: data.safeHtml }}
                  />
                ) : (
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800">
                    {email.body_text || "(no text content)"}
                  </pre>
                )}
              </section>

              {/* (c) AI analysis — visually distinct */}
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-amber-900">AI analysis</h3>
                  <AiNotice />
                </div>
                {classification ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <CategoryBadge category={classification.category} />
                      <SeverityMeter value={classification.severity} />
                    </div>
                    {classification.rationale && (
                      <p className="text-sm text-amber-900">{classification.rationale}</p>
                    )}
                    {classification.snippets.length > 0 && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                          Cited snippets
                        </p>
                        <ul className="mt-1 space-y-1">
                          {classification.snippets.map((s, i) => (
                            <li
                              key={i}
                              className="rounded border border-amber-200 bg-white px-3 py-1.5 text-sm text-slate-700"
                            >
                              “{s}”
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-amber-900">
                    This message has not been classified yet.
                  </p>
                )}
              </section>

              {/* Flag controls */}
              <section className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-ink">Case folder</h3>
                {flagged ? (
                  <div className="mt-2 space-y-3">
                    <p className="text-sm text-slate-600">
                      This message is flagged for your case folder.
                    </p>
                    <Button variant="danger" size="sm" onClick={toggleFlag} disabled={savingFlag}>
                      {savingFlag ? <Spinner /> : null}
                      Remove from case folder
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2 space-y-3">
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Optional note (why this matters to you)"
                      rows={2}
                    />
                    <Button size="sm" onClick={toggleFlag} disabled={savingFlag}>
                      {savingFlag ? <Spinner /> : null}
                      Flag for case folder
                    </Button>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
