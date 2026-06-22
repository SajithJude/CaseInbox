import type { HarmCategory } from "./constants";

export type ScanStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "canceled";

export interface ScanScope {
  from?: string; // sender or domain
  to?: string;
  after?: string; // YYYY-MM-DD
  before?: string; // YYYY-MM-DD
  label?: string; // Gmail label, e.g. INBOX
  query?: string; // extra keywords
  maxMessages?: number;
}

export interface Profile {
  id: string;
  email: string;
  is_demo: boolean;
  disclaimer_acknowledged_at: string | null;
  created_at: string;
}

export interface UserSettings {
  user_id: string;
  gemini_key_encrypted: string | null;
  gemini_key_hint: string | null;
  classify_model: string;
  chat_model: string;
  updated_at: string;
}

export interface GmailConnection {
  id: string;
  user_id: string;
  email: string | null;
  status: string;
  scope: string | null;
  created_at: string;
}

export interface ScanJob {
  id: string;
  user_id: string;
  scope: ScanScope;
  status: ScanStatus;
  total: number;
  processed: number;
  failed: number;
  error: string | null;
  page_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailRecord {
  id: string;
  user_id: string;
  scan_job_id: string | null;
  gmail_message_id: string;
  thread_id: string | null;
  from_addr: string | null;
  to_addrs: string | null;
  cc_addrs: string | null;
  sent_at: string | null;
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  body_html: string | null;
  raw_eml: string | null;
  has_attachments: boolean;
  created_at: string;
}

export interface Classification {
  id: string;
  email_id: string;
  user_id: string;
  category: HarmCategory;
  severity: number; // 0-10
  rationale: string | null;
  snippets: string[];
  model_version: string | null;
  created_at: string;
}

// Joined row used across dashboard / chat / case folder.
export interface EmailWithClassification extends EmailRecord {
  classification: Classification | null;
  flagged?: boolean;
  user_note?: string | null;
}

export interface CaseItem {
  id: string;
  user_id: string;
  email_id: string;
  user_note: string | null;
  added_at: string;
}

export type ChatRole = "user" | "assistant" | "tool" | "system";

export interface Citation {
  email_id: string;
  gmail_message_id?: string;
  subject?: string | null;
  from_addr?: string | null;
  sent_at?: string | null;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  conversation_id: string;
  role: ChatRole;
  content: string | null;
  tool_calls: unknown;
  citations: Citation[] | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
}

// Structured result of Stage-1 classification (Gemini JSON contract).
export interface ClassificationResult {
  category: HarmCategory;
  severity: number;
  rationale: string;
  snippets: string[];
}
