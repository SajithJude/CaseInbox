import type { SupabaseClient } from "@supabase/supabase-js";
import { callGemini, type GeminiContent, type GeminiTool } from "../gemini";
import {
  gmailClientFromTokens,
  buildGmailQuery,
} from "../gmail";
import { decryptSecret } from "../crypto";
import type { ScanScope } from "../types";

// The onboarding agent turns plain-language requests ("find hostile emails from
// my manager at initech.com over the last year") into a concrete, scoped scan —
// connecting Gmail first if needed. It drives setup so the user never touches a form.

export interface OnboardingAction {
  type: "connect_gmail" | "scan_started";
  jobId?: string;
  scope?: ScanScope;
}

export interface OnboardingTurn {
  answer: string;
  actions: OnboardingAction[];
}

const TOOLS: GeminiTool[] = [
  {
    functionDeclarations: [
      {
        name: "check_gmail_connection",
        description:
          "Check whether the user's Gmail is connected (read-only). Call this before proposing or starting a scan.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "request_gmail_connect",
        description:
          "Ask the user to connect their Gmail (read-only). Call this when Gmail is not yet connected. The interface will show a Connect button.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "list_gmail_labels",
        description:
          "List the user's Gmail labels/folders, to help target a scan. Requires Gmail to be connected.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "start_scan",
        description:
          "Create and start a read-only scan over the user's mailbox using the given filters. Prefer narrow scopes (a sender/domain and/or a date range) to control cost and noise. Returns a job id; the interface then shows live progress.",
        parameters: {
          type: "object",
          properties: {
            from: {
              type: "string",
              description: "Sender email or domain to restrict to, e.g. 'manager@initech.com' or 'initech.com'.",
            },
            to: { type: "string", description: "Recipient to restrict to. Optional." },
            after: { type: "string", description: "Only emails on/after this date, format YYYY-MM-DD." },
            before: { type: "string", description: "Only emails before this date, format YYYY-MM-DD." },
            label: { type: "string", description: "Gmail label/folder, e.g. 'INBOX'. Optional." },
            query: {
              type: "string",
              description: "Extra Gmail search keywords, e.g. 'fired OR warning'. Optional.",
            },
            max_messages: {
              type: "integer",
              description: "Cap on messages to scan (1-50, default 50). Keep small for a first pass.",
            },
          },
        },
      },
    ],
  },
];

const SYSTEM = `You are CaseInbox's onboarding assistant. You help a stressed, possibly non-technical person set up a read-only scan of THEIR OWN Gmail to find workplace emails that may matter in an employment dispute. You are not a lawyer and do not give legal advice.

Your job each turn:
1. Understand, in plain language, what they want to find: who sent it (a person or an employer domain), over what time period, and what kind of conduct (harassment, discrimination, threats, retaliation, defamation, inappropriate conduct) or keywords.
2. ALWAYS call check_gmail_connection before scanning. If not connected, call request_gmail_connect and tell them to click Connect Gmail; do not attempt to scan yet.
3. Once connected and you have enough detail, call start_scan with concrete filters. Strongly prefer narrowing by sender/domain and/or a date range — explain briefly that this keeps the scan fast, cheap, and focused. Convert relative times ("last year", "since March") into YYYY-MM-DD dates; today's date is provided below.
4. After starting a scan, tell them in one or two calm sentences what you're scanning and that they'll see progress, then results on the dashboard.

Rules: Be concise, warm, and reassuring. Never invent email content. Access is strictly read-only — reassure them nothing is sent, deleted, or changed. If their request is vague, ask ONE focused question rather than guessing wildly. Don't over-collect: a sender/domain plus a timeframe is usually enough to start.`;

function todayISO(now: Date): string {
  return now.toISOString().slice(0, 10);
}

async function getConnection(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("gmail_connections")
    .select("email, status, access_token_encrypted, refresh_token_encrypted")
    .eq("user_id", userId)
    .maybeSingle();
  return data as
    | {
        email: string | null;
        status: string;
        access_token_encrypted: string | null;
        refresh_token_encrypted: string | null;
      }
    | null;
}

function normalizeScope(args: Record<string, unknown>): ScanScope {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const max = Math.max(1, Math.min(50, Number(args.max_messages) || 50));
  return {
    from: str(args.from),
    to: str(args.to),
    after: str(args.after),
    before: str(args.before),
    label: str(args.label),
    query: str(args.query),
    maxMessages: max,
  };
}

async function createScanJob(
  supabase: SupabaseClient,
  userId: string,
  scope: ScanScope
): Promise<string | null> {
  const { data } = await supabase
    .from("scan_jobs")
    .insert({ user_id: userId, scope, status: "queued", total: 0, processed: 0, failed: 0 })
    .select("id")
    .single();
  return (data?.id as string) ?? null;
}

interface RunParams {
  supabase: SupabaseClient;
  userId: string;
  apiKey: string | null;
  model: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  now: Date;
}

export async function runOnboardingAgent(params: RunParams): Promise<OnboardingTurn> {
  const { supabase, userId, apiKey, model, history, userMessage, now } = params;
  if (!apiKey) {
    return runHeuristicOnboarding(supabase, userId, userMessage, now);
  }

  const contents: GeminiContent[] = history.map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [{ text: h.content }],
  }));
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const actions: OnboardingAction[] = [];
  const system = `${SYSTEM}\n\nToday's date is ${todayISO(now)}.`;

  // Guarantee the UI gets a connect prompt whenever Gmail isn't connected and no
  // scan was started — independent of whether the model emitted the tool call.
  const finalize = async (answer: string): Promise<OnboardingTurn> => {
    if (!actions.some((a) => a.type === "scan_started" || a.type === "connect_gmail")) {
      const conn = await getConnection(supabase, userId);
      if (!conn || conn.status !== "connected") actions.push({ type: "connect_gmail" });
    }
    return { answer, actions };
  };

  for (let i = 0; i < 6; i++) {
    const res = await callGemini({
      apiKey,
      model,
      systemInstruction: system,
      tools: TOOLS,
      thinkingLevel: "low",
      temperature: 0.3,
      contents,
    });

    if (res.functionCalls.length === 0) {
      return finalize(res.text || "Tell me whose emails you'd like to look through, and roughly when.");
    }

    contents.push({ role: "model", parts: res.parts });
    const responseParts = [];
    for (const fc of res.functionCalls) {
      let result: Record<string, unknown> = {};
      if (fc.name === "check_gmail_connection") {
        const conn = await getConnection(supabase, userId);
        result = { connected: Boolean(conn && conn.status === "connected"), email: conn?.email ?? null };
      } else if (fc.name === "request_gmail_connect") {
        if (!actions.some((a) => a.type === "connect_gmail")) actions.push({ type: "connect_gmail" });
        result = { ok: true, shown: true };
      } else if (fc.name === "list_gmail_labels") {
        result = await listLabels(supabase, userId);
      } else if (fc.name === "start_scan") {
        const conn = await getConnection(supabase, userId);
        if (!conn || conn.status !== "connected") {
          if (!actions.some((a) => a.type === "connect_gmail")) actions.push({ type: "connect_gmail" });
          result = { error: "Gmail is not connected yet. Ask the user to connect first." };
        } else {
          const scope = normalizeScope(fc.args);
          const jobId = await createScanJob(supabase, userId, scope);
          if (jobId) {
            actions.push({ type: "scan_started", jobId, scope });
            result = { ok: true, jobId, scope };
          } else {
            result = { error: "Could not create the scan job." };
          }
        }
      } else {
        result = { error: `Unknown tool ${fc.name}` };
      }
      responseParts.push({ functionResponse: { name: fc.name, response: { result } } });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return finalize("Let's set this up. Whose emails should I focus on, and over what time period?");
}

async function listLabels(
  supabase: SupabaseClient,
  userId: string
): Promise<Record<string, unknown>> {
  const conn = await getConnection(supabase, userId);
  if (!conn || conn.status !== "connected") return { error: "Gmail not connected" };
  try {
    const access = conn.access_token_encrypted ? decryptSecret(conn.access_token_encrypted) : "";
    const refresh = conn.refresh_token_encrypted ? decryptSecret(conn.refresh_token_encrypted) : undefined;
    const gmail = gmailClientFromTokens(access, refresh);
    const res = await gmail.users.labels.list({ userId: "me" });
    return { labels: (res.data.labels ?? []).map((l) => l.name).filter(Boolean) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not list labels" };
  }
}

// ─── Heuristic fallback (no Gemini key) ──────────────────────────────────────
async function runHeuristicOnboarding(
  supabase: SupabaseClient,
  userId: string,
  message: string,
  now: Date
): Promise<OnboardingTurn> {
  const conn = await getConnection(supabase, userId);
  if (!conn || conn.status !== "connected") {
    return {
      answer:
        "First, let's connect your Gmail (read-only — nothing is ever changed or sent). Click Connect Gmail below, then tell me whose emails to look through and over what time period.",
      actions: [{ type: "connect_gmail" }],
    };
  }

  const scope = parseScopeHeuristic(message, now);
  if (!scope.from && !scope.query && !scope.label) {
    return {
      answer:
        "Tell me whose emails to focus on — a person's address or your employer's domain (e.g. \"initech.com\") — and roughly the time period, and I'll start a scan.",
      actions: [],
    };
  }
  const jobId = await createScanJob(supabase, userId, scope);
  if (!jobId) {
    return { answer: "Sorry, I couldn't start the scan just now. Please try again.", actions: [] };
  }
  const bits = [
    scope.from ? `from ${scope.from}` : null,
    scope.after ? `since ${scope.after}` : null,
    scope.query ? `matching "${scope.query}"` : null,
  ].filter(Boolean);
  return {
    answer: `Starting a read-only scan ${bits.join(", ") || "of your inbox"} (up to ${scope.maxMessages} messages). You'll see progress below, then results on your dashboard.`,
    actions: [{ type: "scan_started", jobId, scope }],
  };
}

function parseScopeHeuristic(message: string, now: Date): ScanScope {
  const lower = message.toLowerCase();
  const scope: ScanScope = { label: "INBOX", maxMessages: 50 };

  const email = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const domain = message.match(/\b([a-z0-9-]+\.(?:com|org|net|io|co|gov|edu))\b/i);
  if (email) scope.from = email[0];
  else if (domain) scope.from = domain[1];

  const monthsMatch = lower.match(/last (\d+) months?/);
  const yearsMatch = lower.match(/last (\d+) years?/);
  const d = new Date(now);
  if (lower.includes("last year") || (yearsMatch && yearsMatch[1] === "1")) {
    d.setFullYear(d.getFullYear() - 1);
    scope.after = d.toISOString().slice(0, 10);
  } else if (yearsMatch) {
    d.setFullYear(d.getFullYear() - Number(yearsMatch[1]));
    scope.after = d.toISOString().slice(0, 10);
  } else if (monthsMatch) {
    d.setMonth(d.getMonth() - Number(monthsMatch[1]));
    scope.after = d.toISOString().slice(0, 10);
  } else if (lower.includes("last month")) {
    d.setMonth(d.getMonth() - 1);
    scope.after = d.toISOString().slice(0, 10);
  }

  const concerns = ["harass", "discriminat", "threat", "retaliat", "defam", "hostile", "fired", "warning", "complaint"];
  const found = concerns.filter((c) => lower.includes(c));
  if (found.length) scope.query = found.join(" OR ");

  return scope;
}
