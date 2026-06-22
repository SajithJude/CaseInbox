import { google } from "googleapis";
import type { ScanScope } from "./types";
import { GMAIL_READONLY_SCOPE } from "./constants";

export function gmailConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/api/gmail/callback"
  );
}

export function getAuthUrl(state: string): string {
  const oauth2 = getOAuthClient();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_READONLY_SCOPE],
    state,
  });
}

export async function exchangeCode(code: string) {
  const oauth2 = getOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  return tokens; // { access_token, refresh_token, expiry_date, scope }
}

export function gmailClientFromTokens(accessToken: string, refreshToken?: string) {
  const oauth2 = getOAuthClient();
  oauth2.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oauth2 });
}

// Build a Gmail search query from the user-selected scope (PRD §5.2).
export function buildGmailQuery(scope: ScanScope): string {
  const parts: string[] = [];
  if (scope.from) parts.push(`from:${scope.from}`);
  if (scope.to) parts.push(`to:${scope.to}`);
  if (scope.after) parts.push(`after:${scope.after.replace(/-/g, "/")}`);
  if (scope.before) parts.push(`before:${scope.before.replace(/-/g, "/")}`);
  if (scope.label) parts.push(`label:${scope.label}`);
  if (scope.query) parts.push(scope.query);
  return parts.join(" ").trim();
}

type GmailClient = ReturnType<typeof gmailClientFromTokens>;

export async function listMessageIds(
  gmail: GmailClient,
  query: string,
  pageToken?: string,
  maxResults = 50
) {
  const res = await gmail.users.messages.list({
    userId: "me",
    q: query || undefined,
    pageToken,
    maxResults,
  });
  return {
    ids: (res.data.messages ?? []).map((m) => m.id!).filter(Boolean),
    nextPageToken: res.data.nextPageToken ?? null,
    estimate: res.data.resultSizeEstimate ?? 0,
  };
}

export interface ParsedMessage {
  gmailMessageId: string;
  threadId: string | null;
  from: string;
  to: string;
  cc: string;
  subject: string;
  sentAt: string | null;
  snippet: string;
  bodyText: string;
  bodyHtml: string;
  rawEml: string;
  hasAttachments: boolean;
}

function header(headers: Array<{ name?: string | null; value?: string | null }>, name: string): string {
  const h = headers.find((x) => (x.name || "").toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

function decodeB64Url(data?: string | null): string {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

interface MessagePart {
  mimeType?: string | null;
  filename?: string | null;
  body?: { data?: string | null } | null;
  parts?: MessagePart[];
}

function extractBodies(part: MessagePart, acc: { text: string; html: string; attach: boolean }) {
  if (!part) return;
  if (part.filename) acc.attach = true;
  if (part.mimeType === "text/plain" && part.body?.data) acc.text += decodeB64Url(part.body.data);
  else if (part.mimeType === "text/html" && part.body?.data) acc.html += decodeB64Url(part.body.data);
  for (const p of part.parts ?? []) extractBodies(p, acc);
}

export async function getMessage(gmail: GmailClient, id: string): Promise<ParsedMessage> {
  const full = await gmail.users.messages.get({ userId: "me", id, format: "full" });
  const msg = full.data;
  const headers = msg.payload?.headers ?? [];
  const acc = { text: "", html: "", attach: false };
  if (msg.payload) extractBodies(msg.payload as MessagePart, acc);

  // Preserve the verbatim original (RFC 822) for evidence integrity (PRD §4.2).
  let rawEml = "";
  try {
    const raw = await gmail.users.messages.get({ userId: "me", id, format: "raw" });
    rawEml = decodeB64Url(raw.data.raw);
  } catch {
    rawEml = "";
  }

  const dateStr = header(headers, "Date");
  let sentAt: string | null = null;
  if (dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) sentAt = d.toISOString();
  }

  return {
    gmailMessageId: msg.id!,
    threadId: msg.threadId ?? null,
    from: header(headers, "From"),
    to: header(headers, "To"),
    cc: header(headers, "Cc"),
    subject: header(headers, "Subject"),
    sentAt,
    snippet: msg.snippet ?? "",
    bodyText: acc.text || stripTags(acc.html),
    bodyHtml: acc.html,
    rawEml,
    hasAttachments: acc.attach,
  };
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
