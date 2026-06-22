"use client";

import * as React from "react";
import { Button, Card, Textarea, Spinner } from "@/components/ui";
import { CategoryBadge } from "@/components/CategoryBadge";
import { SeverityMeter } from "@/components/SeverityMeter";
import { AiNotice } from "@/components/AiNotice";
import { formatDate, parseAddress } from "@/lib/format";
import type { HarmCategory } from "@/lib/constants";

export interface CaseClientItem {
  case_item_id: string;
  email_id: string;
  user_note: string | null;
  added_at: string;
  gmail_message_id: string | null;
  thread_id: string | null;
  from_addr: string | null;
  to_addrs: string | null;
  cc_addrs: string | null;
  sent_at: string | null;
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  category: HarmCategory | null;
  severity: number | null;
  rationale: string | null;
  snippets: string[];
}

type ExportFormat = "zip" | "pdf";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the download has begun.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CaseClient({ items: initialItems }: { items: CaseClientItem[] }) {
  const [items, setItems] = React.useState<CaseClientItem[]>(initialItems);
  const [exporting, setExporting] = React.useState<ExportFormat | null>(null);
  const [exportError, setExportError] = React.useState<string | null>(null);

  const empty = items.length === 0;

  async function handleExport(format: ExportFormat) {
    if (empty || exporting) return;
    setExportError(null);
    setExporting(format);
    try {
      const res = await fetch(`/api/export?format=${format}`, { method: "GET" });
      if (!res.ok) {
        let msg = "Export failed.";
        try {
          const body = await res.json();
          if (body?.error) msg = String(body.error);
        } catch {
          // ignore parse failure
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const filename =
        format === "zip" ? "caseinbox-evidence.zip" : "caseinbox-summary.pdf";
      triggerDownload(blob, filename);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  }

  async function handleRemove(emailId: string) {
    const prev = items;
    setItems((cur) => cur.filter((it) => it.email_id !== emailId));
    try {
      const res = await fetch("/api/case", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: emailId }),
      });
      if (!res.ok) throw new Error("remove failed");
    } catch {
      // Restore on failure.
      setItems(prev);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-600">
          <span className="font-medium text-ink">{items.length}</span>{" "}
          {items.length === 1 ? "flagged email" : "flagged emails"}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={empty || exporting !== null}
            onClick={() => handleExport("zip")}
          >
            {exporting === "zip" ? <Spinner /> : null}
            Evidence package (.zip)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={empty || exporting !== null}
            onClick={() => handleExport("pdf")}
          >
            {exporting === "pdf" ? <Spinner /> : null}
            Summary report (PDF)
          </Button>
        </div>
      </div>

      {exportError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {exportError}
        </p>
      ) : null}

      <p className="mb-4 text-xs text-slate-500">
        Originals are preserved with full headers in the evidence package. AI analysis is kept
        separate and is never included in the verbatim originals. <AiNotice className="ml-1" />
      </p>

      <ul className="space-y-4">
        {items.map((item) => (
          <CaseRow key={item.email_id} item={item} onRemove={handleRemove} />
        ))}
      </ul>
    </div>
  );
}

function CaseRow({
  item,
  onRemove,
}: {
  item: CaseClientItem;
  onRemove: (emailId: string) => void;
}) {
  const [note, setNote] = React.useState<string>(item.user_note ?? "");
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const savedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const from = parseAddress(item.from_addr);

  React.useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  async function saveNote() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/case", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: item.email_id, note }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaved(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li>
      <Card className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-medium text-ink">
              {item.subject || "(no subject)"}
            </h3>
            <p className="mt-0.5 truncate text-sm text-slate-600">
              {from.name ? `${from.name} ` : ""}
              {from.email ? (
                <span className="text-slate-500">&lt;{from.email}&gt;</span>
              ) : (
                <span className="text-slate-400">unknown sender</span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{formatDate(item.sent_at)}</p>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onRemove(item.email_id)}
            aria-label="Remove from case folder"
          >
            Remove
          </Button>
        </div>

        {item.category ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <CategoryBadge category={item.category} />
            <SeverityMeter value={item.severity ?? 0} />
            <AiNotice />
          </div>
        ) : null}

        {item.snippet ? (
          <p className="mt-3 line-clamp-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {item.snippet}
          </p>
        ) : null}

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Your note
          </label>
          <Textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setSaved(false);
            }}
            rows={3}
            placeholder="Add context for your records (why this email matters, who was involved, etc.)"
          />
          <div className="mt-2 flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={saveNote} disabled={saving}>
              {saving ? <Spinner /> : null}
              Save note
            </Button>
            {saved ? <span className="text-xs text-emerald-600">Saved</span> : null}
          </div>
        </div>
      </Card>
    </li>
  );
}
