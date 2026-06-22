"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Spinner, Badge } from "@/components/ui";
import { GMAIL_READONLY_SCOPE } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { ScanScope, ScanStatus } from "@/lib/types";

type ConnectionInfo = { status: string; email: string | null } | null;

type RecentJob = {
  id: string;
  status: ScanStatus;
  total: number;
  processed: number;
  failed: number;
  error: string | null;
  created_at: string;
};

type JobState = {
  id: string;
  status: ScanStatus;
  total: number;
  processed: number;
  failed: number;
  error: string | null;
};

const TERMINAL: ScanStatus[] = ["completed", "failed", "canceled"];

function statusColor(status: ScanStatus): string {
  switch (status) {
    case "completed":
      return "#16a34a";
    case "failed":
      return "#b91c1c";
    case "running":
      return "#2563eb";
    case "queued":
      return "#a16207";
    default:
      return "#64748b";
  }
}

export default function ConnectClient({
  connection,
  configured,
  recentJobs,
  demo,
}: {
  connection: ConnectionInfo;
  configured: boolean;
  recentJobs: RecentJob[];
  demo: boolean;
}) {
  const router = useRouter();
  const connected = Boolean(connection && connection.status === "connected");

  const [disconnecting, setDisconnecting] = useState(false);

  // Scan scope form state.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [label, setLabel] = useState("INBOX");
  const [keywords, setKeywords] = useState("");
  const [maxMessages, setMaxMessages] = useState(50);

  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState<JobState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/gmail/disconnect", { method: "POST" });
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  function startPolling(jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/scan/${jobId}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          setFormError(data?.error || "Scan failed.");
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }
        const next: JobState = {
          id: jobId,
          status: data.status as ScanStatus,
          total: data.total ?? 0,
          processed: data.processed ?? 0,
          failed: data.failed ?? 0,
          error: data.error ?? null,
        };
        setJob(next);
        if (TERMINAL.includes(next.status)) {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Transient network error; keep polling.
      }
    }, 1500);
  }

  async function startScan() {
    setFormError(null);
    setStarting(true);
    try {
      const scope: ScanScope = {
        from: from.trim() || undefined,
        to: to.trim() || undefined,
        after: after || undefined,
        before: before || undefined,
        label: label.trim() || undefined,
        query: keywords.trim() || undefined,
        maxMessages: Math.max(1, Math.min(50, Number(maxMessages) || 50)),
      };
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data?.error || "Could not start the scan.");
        return;
      }
      const jobId = data.jobId as string;
      setJob({ id: jobId, status: "queued", total: 0, processed: 0, failed: 0, error: null });
      startPolling(jobId);
    } catch {
      setFormError("Could not start the scan.");
    } finally {
      setStarting(false);
    }
  }

  const progressPct =
    job && job.total > 0 ? Math.min(100, Math.round((job.processed / job.total) * 100)) : 0;
  const scanDone = job && TERMINAL.includes(job.status);
  const scanDisabled = !connected || starting || (job != null && !scanDone);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Scan your mailbox</h1>
        <p className="mt-1 text-sm text-slate-600">
          CaseInbox reads your email strictly read-only. Nothing is ever sent, deleted, labeled, or
          changed in your mailbox. You choose a narrow scope below so only the messages you care
          about are reviewed — this keeps the analysis focused and low-cost.
        </p>
      </header>

      {/* Connection status / OAuth configuration */}
      {!configured ? (
        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink">Gmail connection is not configured</h2>
          <p className="mt-2 text-sm text-slate-600">
            Live Gmail access is not set up on this server yet (the{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">GOOGLE_CLIENT_ID</code> and{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">GOOGLE_CLIENT_SECRET</code>{" "}
            environment variables are missing). When configured, access is requested only with the
            read-only scope:
          </p>
          <p className="mt-2 break-all rounded bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {GMAIL_READONLY_SCOPE}
          </p>
          {demo ? (
            <p className="mt-3 text-sm text-slate-600">
              You are in demo mode, which already has seeded example emails to explore.{" "}
              <Link href="/dashboard" className="font-medium text-brand-700 underline">
                Go to the dashboard
              </Link>
              .
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-600">
              Demo mode comes with seeded example emails so you can try CaseInbox without connecting
              a mailbox.
            </p>
          )}
        </Card>
      ) : connected ? (
        <Card className="flex items-center justify-between gap-4 p-5">
          <div>
            <div className="flex items-center gap-2">
              <Badge color="#16a34a">Connected</Badge>
              <span className="text-sm font-medium text-ink">
                {connection?.email || "Gmail account"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Read-only access. You can revoke this at any time.</p>
          </div>
          <Button variant="danger" size="sm" onClick={disconnect} disabled={disconnecting}>
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </Button>
        </Card>
      ) : (
        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink">Connect your Gmail (read-only)</h2>
          <p className="mt-2 text-sm text-slate-600">
            Connecting grants CaseInbox read-only access to your mailbox. Nothing is modified.
          </p>
          <p className="mt-2 break-all rounded bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {GMAIL_READONLY_SCOPE}
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              window.location.href = "/api/gmail/start";
            }}
          >
            Connect Gmail (read-only)
          </Button>
        </Card>
      )}

      {/* Scope form + scanner — hidden in unconfigured demo to keep it simple */}
      {!(demo && !configured) && (
        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink">Choose what to scan</h2>
          <p className="mt-1 text-sm text-slate-600">
            Pre-filtering narrows the search before any analysis runs, which reduces noise and cost.
            Leave a field blank to skip it.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="scan-from">From (sender or domain)</Label>
              <Input
                id="scan-from"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="manager@company.com"
              />
            </div>
            <div>
              <Label htmlFor="scan-to">To (optional)</Label>
              <Input
                id="scan-to"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            <div>
              <Label htmlFor="scan-after">After date</Label>
              <Input
                id="scan-after"
                type="date"
                value={after}
                onChange={(e) => setAfter(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="scan-before">Before date</Label>
              <Input
                id="scan-before"
                type="date"
                value={before}
                onChange={(e) => setBefore(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="scan-label">Label</Label>
              <Input
                id="scan-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="INBOX"
              />
            </div>
            <div>
              <Label htmlFor="scan-max">Max messages</Label>
              <Input
                id="scan-max"
                type="number"
                min={1}
                max={50}
                value={maxMessages}
                onChange={(e) => setMaxMessages(Number(e.target.value))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="scan-keywords">Keywords (optional)</Label>
              <Input
                id="scan-keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder='e.g. "performance" OR complaint'
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <span title={!connected ? "Connect Gmail first to start a scan." : undefined}>
              <Button onClick={startScan} disabled={scanDisabled}>
                {starting ? <Spinner /> : null}
                Start scan
              </Button>
            </span>
            {!connected && (
              <span className="text-xs text-slate-500">Connect Gmail above to enable scanning.</span>
            )}
          </div>

          {formError && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
          )}

          {job && (
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink">
                  Scan status:{" "}
                  <Badge color={statusColor(job.status)}>{job.status}</Badge>
                </span>
                <span className="text-sm text-slate-600">
                  {job.processed} / {job.total || "?"} processed
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {job.failed > 0 && (
                <p className="mt-2 text-xs text-amber-700">{job.failed} message(s) could not be processed and were skipped.</p>
              )}
              {job.status === "failed" && job.error && (
                <p className="mt-2 text-sm text-red-700">{job.error}</p>
              )}
              {job.status === "completed" && (
                <p className="mt-3 text-sm text-slate-700">
                  Scan complete.{" "}
                  <Link href="/dashboard" className="font-medium text-brand-700 underline">
                    View results on the dashboard
                  </Link>
                  .
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {recentJobs.length > 0 && (
        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink">Recent scans</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {recentJobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-500">{formatDateTime(j.created_at)}</span>
                <span className="flex items-center gap-3">
                  <span className="text-slate-600">
                    {j.processed}/{j.total || "?"}
                    {j.failed > 0 ? ` (${j.failed} skipped)` : ""}
                  </span>
                  <Badge color={statusColor(j.status)}>{j.status}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
