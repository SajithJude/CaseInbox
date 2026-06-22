"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { Button, Card, Spinner, Badge } from "@/components/ui";
import { AiNotice } from "@/components/AiNotice";

type Msg = { role: "user" | "assistant"; content: string };
type Action = { type: "connect_gmail" | "scan_started"; jobId?: string; scope?: Record<string, unknown> };
type ScanState = {
  jobId: string;
  status: string;
  total: number;
  processed: number;
  failed: number;
  error: string | null;
};

const EXAMPLES = [
  "Find hostile or threatening emails from my manager at initech.com over the last year",
  "Anything from hr@initech.com about my complaint in the last 6 months",
  "Show emails mentioning my age or a disability from the last year",
];

export function OnboardingChat({
  configured,
  connected,
  connectedEmail,
  justConnected,
  oauthError,
  hasExistingEmails,
}: {
  configured: boolean;
  connected: boolean;
  connectedEmail: string | null;
  justConnected: boolean;
  oauthError: string | null;
  hasExistingEmails: boolean;
}) {
  const greeting =
    (justConnected ? "Your Gmail is connected. " : "") +
    (connected
      ? "Tell me whose emails to look through and roughly when — for example, a manager's address or your employer's domain over the last year — and I'll run a focused, read-only scan."
      : "I'll help you find the emails that matter. First we'll connect your Gmail (read-only — nothing is ever sent, deleted, or changed). Tell me what you're looking for and I'll get you connected and scanning.");

  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: greeting }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showConnect, setShowConnect] = useState(!connected);
  const [scan, setScan] = useState<ScanState | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, scan]);

  // Poll a running scan job, advancing batches server-side on each GET.
  const pollScan = useCallback((jobId: string) => {
    let stop = false;
    async function tick() {
      if (stop) return;
      try {
        const res = await fetch(`/api/scan/${jobId}`);
        const data = await res.json();
        setScan({
          jobId,
          status: data.status,
          total: data.total ?? 0,
          processed: data.processed ?? 0,
          failed: data.failed ?? 0,
          error: data.error ?? null,
        });
        if (data.status === "completed" || data.status === "failed") {
          stop = true;
          return;
        }
      } catch {
        /* transient; keep polling */
      }
      setTimeout(tick, 1500);
    }
    tick();
    return () => {
      stop = true;
    };
  }, []);

  function handleActions(actions: Action[]) {
    for (const a of actions) {
      if (a.type === "connect_gmail") setShowConnect(true);
      if (a.type === "scan_started" && a.jobId) {
        setShowConnect(false);
        setScan({ jobId: a.jobId, status: "queued", total: 0, processed: 0, failed: 0, error: null });
        pollScan(a.jobId);
      }
    }
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const nextMessages = [...messages, { role: "user" as const, content: message }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: messages }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => [...m, { role: "assistant", content: data?.error || "Something went wrong. Please try again." }]);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.answer }]);
      handleActions(data.actions ?? []);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "I couldn't reach the server. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  const pct = scan && scan.total > 0 ? Math.round(((scan.processed + scan.failed) / scan.total) * 100) : 0;

  return (
    <Card className="flex h-[60vh] min-h-[460px] flex-col overflow-hidden">
      {/* status bar */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          {connected ? (
            <>
              <Badge color="#16a34a">Gmail connected</Badge>
              {connectedEmail && <span className="text-slate-500">{connectedEmail}</span>}
            </>
          ) : (
            <Badge color="#64748b">Gmail not connected</Badge>
          )}
        </div>
        <Link href="/connect" className="text-xs font-medium text-slate-500 underline hover:text-slate-700">
          Prefer to set filters manually?
        </Link>
      </div>

      {!configured && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Gmail OAuth isn&apos;t configured on this deployment yet, so live scanning is unavailable. You can
          still explore the demo data from the dashboard.
        </div>
      )}
      {oauthError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          Gmail connection error: {oauthError}. Please try connecting again.
        </div>
      )}

      {/* messages */}
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2 text-sm text-white"
                  : "max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2 text-sm text-ink"
              }
            >
              {m.content}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2 text-sm text-slate-500">
              <Spinner />
            </div>
          </div>
        )}

        {showConnect && configured && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl border border-brand-200 bg-brand-50 p-3">
              <p className="mb-2 text-sm text-ink">Connect your Gmail to continue. Access is strictly read-only.</p>
              <a href="/api/gmail/start?from=onboarding">
                <Button size="sm">Connect Gmail (read-only)</Button>
              </a>
            </div>
          </div>
        )}

        {scan && (
          <div className="flex justify-start">
            <div className="w-full max-w-[85%] rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-ink">
                  {scan.status === "completed"
                    ? "Scan complete"
                    : scan.status === "failed"
                    ? "Scan failed"
                    : "Scanning your inbox…"}
                </span>
                <span className="text-slate-500">
                  {scan.processed}
                  {scan.total ? ` / ${scan.total}` : ""}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-brand-500 transition-all"
                  style={{ width: `${scan.status === "completed" ? 100 : pct}%` }}
                />
              </div>
              {scan.failed > 0 && (
                <p className="mt-1 text-xs text-amber-700">{scan.failed} message(s) could not be analyzed.</p>
              )}
              {scan.error && <p className="mt-1 text-xs text-red-600">{scan.error}</p>}
              {scan.status === "completed" && (
                <Link href="/dashboard" className="mt-2 inline-block">
                  <Button size="sm">View results</Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* examples + input */}
      <div className="border-t border-slate-200 p-3">
        {messages.length <= 1 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => send(ex)}
                disabled={busy}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="e.g. Find threatening emails from my manager at initech.com this year"
            className="max-h-32 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            Send
          </Button>
        </form>
        <p className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          <AiNotice /> Classifications are interpretations, not legal findings.
          {hasExistingEmails && (
            <Link href="/dashboard" className="ml-auto underline">
              Skip to dashboard
            </Link>
          )}
        </p>
      </div>
    </Card>
  );
}
