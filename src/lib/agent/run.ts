import type { SupabaseClient } from "@supabase/supabase-js";
import { callGemini, type GeminiContent } from "../gemini";
import { AGENT_TOOLS, runTool } from "./tools";
import type { Citation } from "../types";
import { AI_NOTICE, HARM_CATEGORIES, type HarmCategory } from "../constants";

const SYSTEM = `You are CaseInbox's assistant. You help a person search and organize THEIR OWN mailbox to find emails that may matter in an employment dispute. You are not a lawyer and do not give legal advice.

Rules:
- Use the provided tools to find emails. NEVER invent emails, quotes, senders, or dates.
- EVERY factual claim or quote about the mailbox MUST come from a tool result. Cite the source email id like [#<email_id>] immediately after the claim.
- If a tool returns nothing, say so plainly. Do not speculate.
- Quotes must be copied verbatim from tool results (snippets/body). Never paraphrase a quote inside quotation marks.
- Be calm, concise, and supportive. The user is stressed. Avoid alarming or sensational language.
- Remind the user, when relevant, that AI labels are interpretations, not legal findings.
- When the user asks to save/flag an email, call flag_email.`;

export interface AgentTurn {
  answer: string;
  citations: Citation[];
}

interface RunParams {
  supabase: SupabaseClient;
  userId: string;
  apiKey: string | null;
  model: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
}

export async function runAgent(params: RunParams): Promise<AgentTurn> {
  const { supabase, userId, apiKey, model, history, userMessage } = params;
  if (!apiKey) {
    return runMockAgent(supabase, userId, userMessage);
  }

  const contents: GeminiContent[] = history.map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [{ text: h.content }],
  }));
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const citations: Citation[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < 6; i++) {
    const res = await callGemini({
      apiKey,
      model,
      systemInstruction: SYSTEM,
      tools: AGENT_TOOLS,
      thinkingLevel: "medium",
      temperature: 0.3,
      contents,
    });

    if (res.functionCalls.length === 0) {
      return { answer: res.text || "I could not find anything for that request.", citations };
    }

    // Record the model's tool-call turn, then execute and feed results back.
    contents.push({ role: "model", parts: res.parts });
    const responseParts = [];
    for (const fc of res.functionCalls) {
      const outcome = await runTool(supabase, userId, fc.name, fc.args);
      for (const c of outcome.citations) {
        if (!seen.has(c.email_id)) {
          seen.add(c.email_id);
          citations.push(c);
        }
      }
      responseParts.push({
        functionResponse: { name: fc.name, response: { result: outcome.result } },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return {
    answer:
      "I gathered results but reached the tool-call limit before finishing. Please narrow your request.",
    citations,
  };
}

// ─── Deterministic fallback agent (no API key) ───────────────────────────────
// Keeps the chat genuinely functional in demo mode: it runs real tool calls
// against the user's data and composes a cited answer.
async function runMockAgent(
  supabase: SupabaseClient,
  userId: string,
  message: string
): Promise<AgentTurn> {
  const lower = message.toLowerCase();

  const categoryHints: Array<[HarmCategory, string[]]> = [
    ["threats", ["threat", "intimidat", "scared", "afraid"]],
    ["discrimination", ["age", "discriminat", "disab", "race", "gender", "religion", "pregnan"]],
    ["retaliation", ["retaliat", "after i complained", "revenge", "punish"]],
    ["defamation", ["defam", "lie about me", "reputation", "slander"]],
    ["inappropriate", ["inappropriate", "creepy", "romantic", "drinks"]],
    ["harassment", ["hostile", "harass", "belittl", "insult", "mean", "rude", "worst", "hostile"]],
  ];

  let category: HarmCategory | null = null;
  for (const [cat, hints] of categoryHints) {
    // Word-boundary match so short stems (e.g. "age") don't match inside
    // unrelated words (e.g. "manager").
    if (hints.some((h) => new RegExp(`\\b${h}`).test(lower))) {
      category = cat;
      break;
    }
  }

  // Extract a sender hint like "from <name>"
  const fromMatch = lower.match(/from ([a-z0-9._%+-]+@?[a-z0-9.-]*)/);
  const from = fromMatch?.[1]?.replace(/[^a-z0-9@._-]/g, "") || undefined;

  const wantsFlag = /\b(flag|save|add to (my )?case|keep this)\b/.test(lower);

  let outcome;
  if (category) {
    outcome = await runTool(supabase, userId, "list_by_category", {
      category,
      min_severity: lower.includes("most") || lower.includes("worst") ? 6 : 1,
      limit: 10,
    });
  } else {
    outcome = await runTool(supabase, userId, "search_emails", {
      query: keywordsFrom(message),
      from,
      limit: 10,
    });
  }

  const rows = Array.isArray(outcome.result) ? (outcome.result as Array<Record<string, unknown>>) : [];

  if (rows.length === 0) {
    return {
      answer:
        "I searched your analyzed emails but did not find anything matching that. Try naming a sender, a date range, or a category like harassment, discrimination, threats, retaliation, defamation, or inappropriate conduct.\n\n_" +
        AI_NOTICE +
        "_",
      citations: [],
    };
  }

  if (wantsFlag && rows[0]) {
    await runTool(supabase, userId, "flag_email", { email_id: rows[0].email_id });
  }

  const lines = rows.slice(0, 6).map((r) => {
    const date = r.date ? new Date(String(r.date)).toLocaleDateString() : "unknown date";
    return `- **${r.subject || "(no subject)"}** — ${r.from} · ${date} · _${r.category}_ (severity ${r.severity}). ${r.rationale ?? ""} [#${r.email_id}]`;
  });

  const intro = category
    ? `Here are the emails I classified as **${category}**, most severe first:`
    : `Here is what I found for "${message.trim()}":`;

  return {
    answer:
      `${intro}\n\n${lines.join("\n")}\n\n` +
      (wantsFlag ? "I added the top result to your case folder.\n\n" : "") +
      `You can open any email to read the verbatim original with full headers, and flag the ones that matter.\n\n_${AI_NOTICE}_`,
    citations: outcome.citations,
  };
}

function keywordsFrom(message: string): string {
  const stop = new Set([
    "show","me","the","my","of","from","in","last","year","all","any","emails","email","that","where",
    "find","get","please","about","with","a","an","to","and","is","are","most","worst","mentioning","anything",
  ]);
  const words = message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w) && !HARM_CATEGORIES.includes(w as HarmCategory));
  return words.slice(0, 5).join(" ");
}
