import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeminiTool } from "../gemini";
import type { Citation, EmailWithClassification } from "../types";
import { HARM_CATEGORIES } from "../constants";

// Tool declarations exposed to the chat agent (PRD §5.5).
export const AGENT_TOOLS: GeminiTool[] = [
  {
    functionDeclarations: [
      {
        name: "search_emails",
        description:
          "Search the user's analyzed emails by keywords and/or structured filters. Combines Postgres full-text search over the body with category/severity filters. Returns matching emails with their AI classification.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Keywords or phrase to full-text search. Optional." },
            category: {
              type: "string",
              enum: [...HARM_CATEGORIES],
              description: "Restrict to a harm category. Optional.",
            },
            min_severity: { type: "integer", description: "Minimum severity 0-10. Optional." },
            from: { type: "string", description: "Filter by sender address or domain substring. Optional." },
            limit: { type: "integer", description: "Max results (default 15)." },
          },
        },
      },
      {
        name: "list_by_category",
        description: "List classified emails in a category, ranked by severity then date.",
        parameters: {
          type: "object",
          properties: {
            category: { type: "string", enum: [...HARM_CATEGORIES] },
            min_severity: { type: "integer" },
            limit: { type: "integer" },
          },
          required: ["category"],
        },
      },
      {
        name: "get_email",
        description: "Fetch the full content and headers of a single email by its id.",
        parameters: {
          type: "object",
          properties: { email_id: { type: "string" } },
          required: ["email_id"],
        },
      },
      {
        name: "summarize_thread",
        description: "Return all messages in a conversation thread (by thread_id) in chronological order so you can summarize it.",
        parameters: {
          type: "object",
          properties: { thread_id: { type: "string" } },
          required: ["thread_id"],
        },
      },
      {
        name: "flag_email",
        description: "Add an email to the user's case folder, optionally with a note.",
        parameters: {
          type: "object",
          properties: { email_id: { type: "string" }, note: { type: "string" } },
          required: ["email_id"],
        },
      },
      {
        name: "unflag_email",
        description: "Remove an email from the case folder.",
        parameters: {
          type: "object",
          properties: { email_id: { type: "string" } },
          required: ["email_id"],
        },
      },
    ],
  },
];

type ToolArgs = Record<string, unknown>;
export interface ToolOutcome {
  result: unknown;
  citations: Citation[];
}

function toCitation(e: Pick<EmailWithClassification, "id" | "gmail_message_id" | "subject" | "from_addr" | "sent_at">): Citation {
  return {
    email_id: e.id,
    gmail_message_id: e.gmail_message_id,
    subject: e.subject,
    from_addr: e.from_addr,
    sent_at: e.sent_at,
  };
}

const EMAIL_SELECT =
  "id, gmail_message_id, thread_id, from_addr, to_addrs, cc_addrs, sent_at, subject, snippet, body_text, classification:classifications(id, category, severity, rationale, snippets, model_version)";

function flattenRow(row: Record<string, unknown>): EmailWithClassification {
  const c = row.classification;
  const classification = Array.isArray(c) ? (c[0] ?? null) : (c ?? null);
  return { ...(row as unknown as EmailWithClassification), classification };
}

export async function runTool(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  args: ToolArgs
): Promise<ToolOutcome> {
  switch (name) {
    case "search_emails": {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      const limit = Math.min(Number(args.limit) || 15, 50);
      let q = supabase
        .from("emails")
        .select(EMAIL_SELECT)
        .eq("user_id", userId)
        .limit(200);
      if (query) q = q.textSearch("fts", query, { type: "websearch", config: "english" });
      if (typeof args.from === "string" && args.from) q = q.ilike("from_addr", `%${args.from}%`);
      const { data, error } = await q;
      if (error) return { result: { error: error.message }, citations: [] };
      let rows = (data ?? []).map(flattenRow);
      if (typeof args.category === "string") {
        rows = rows.filter((r) => r.classification?.category === args.category);
      }
      if (args.min_severity != null) {
        const min = Number(args.min_severity);
        rows = rows.filter((r) => (r.classification?.severity ?? 0) >= min);
      }
      rows.sort((a, b) => (b.classification?.severity ?? 0) - (a.classification?.severity ?? 0));
      rows = rows.slice(0, limit);
      return {
        result: rows.map((r) => ({
          email_id: r.id,
          from: r.from_addr,
          date: r.sent_at,
          subject: r.subject,
          category: r.classification?.category,
          severity: r.classification?.severity,
          rationale: r.classification?.rationale,
          snippet: r.snippet,
        })),
        citations: rows.map(toCitation),
      };
    }

    case "list_by_category": {
      const limit = Math.min(Number(args.limit) || 20, 50);
      const min = Number(args.min_severity) || 0;
      const { data, error } = await supabase
        .from("classifications")
        .select(
          "category, severity, rationale, email:emails!inner(id, gmail_message_id, from_addr, sent_at, subject, snippet)"
        )
        .eq("user_id", userId)
        .eq("category", String(args.category))
        .gte("severity", min)
        .order("severity", { ascending: false })
        .limit(limit);
      if (error) return { result: { error: error.message }, citations: [] };
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const emails: Array<Record<string, unknown>> = rows.map((r) => {
        const e = (Array.isArray(r.email) ? r.email[0] : r.email) as Record<string, unknown>;
        return { ...e, category: r.category, severity: r.severity, rationale: r.rationale };
      });
      return {
        result: emails.map((e) => ({
          email_id: e.id,
          from: e.from_addr,
          date: e.sent_at,
          subject: e.subject,
          category: e.category,
          severity: e.severity,
          rationale: e.rationale,
        })),
        citations: emails.map((e) =>
          toCitation(e as unknown as EmailWithClassification)
        ),
      };
    }

    case "get_email": {
      const { data, error } = await supabase
        .from("emails")
        .select(EMAIL_SELECT)
        .eq("user_id", userId)
        .eq("id", String(args.email_id))
        .maybeSingle();
      if (error) return { result: { error: error.message }, citations: [] };
      if (!data) return { result: { error: "Email not found" }, citations: [] };
      const row = flattenRow(data);
      return {
        result: {
          email_id: row.id,
          from: row.from_addr,
          to: row.to_addrs,
          cc: row.cc_addrs,
          date: row.sent_at,
          subject: row.subject,
          body: row.body_text,
          category: row.classification?.category,
          severity: row.classification?.severity,
          rationale: row.classification?.rationale,
        },
        citations: [toCitation(row)],
      };
    }

    case "summarize_thread": {
      const { data, error } = await supabase
        .from("emails")
        .select(EMAIL_SELECT)
        .eq("user_id", userId)
        .eq("thread_id", String(args.thread_id))
        .order("sent_at", { ascending: true });
      if (error) return { result: { error: error.message }, citations: [] };
      const rows = (data ?? []).map(flattenRow);
      return {
        result: rows.map((r) => ({
          email_id: r.id,
          from: r.from_addr,
          date: r.sent_at,
          subject: r.subject,
          body: r.body_text,
          category: r.classification?.category,
          severity: r.classification?.severity,
        })),
        citations: rows.map(toCitation),
      };
    }

    case "flag_email": {
      const { error } = await supabase.from("case_items").upsert(
        {
          user_id: userId,
          email_id: String(args.email_id),
          user_note: typeof args.note === "string" ? args.note : null,
        },
        { onConflict: "user_id,email_id" }
      );
      if (error) return { result: { error: error.message }, citations: [] };
      return { result: { flagged: true, email_id: args.email_id }, citations: [] };
    }

    case "unflag_email": {
      const { error } = await supabase
        .from("case_items")
        .delete()
        .eq("user_id", userId)
        .eq("email_id", String(args.email_id));
      if (error) return { result: { error: error.message }, citations: [] };
      return { result: { flagged: false, email_id: args.email_id }, citations: [] };
    }

    default:
      return { result: { error: `Unknown tool ${name}` }, citations: [] };
  }
}
