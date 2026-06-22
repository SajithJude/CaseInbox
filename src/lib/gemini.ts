import type { ClassificationResult } from "./types";
import { HARM_CATEGORIES, type HarmCategory } from "./constants";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// ─── Low-level call types (Gemini generateContent shape) ─────────────────────
export interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
export interface GeminiContent {
  role: "user" | "model" | "tool";
  parts: GeminiPart[];
}
export interface GeminiTool {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

export interface GeminiCallOptions {
  apiKey: string;
  model: string;
  contents: GeminiContent[];
  systemInstruction?: string;
  tools?: GeminiTool[];
  responseSchema?: Record<string, unknown>;
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
  temperature?: number;
}

export interface GeminiResult {
  parts: GeminiPart[];
  text: string;
  functionCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

export async function callGemini(opts: GeminiCallOptions): Promise<GeminiResult> {
  const body: Record<string, unknown> = {
    contents: opts.contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      ...(opts.responseSchema
        ? { responseMimeType: "application/json", responseSchema: opts.responseSchema }
        : {}),
      // Gemini 2.5 controls reasoning via thinkingConfig.thinkingBudget
      // (-1 = dynamic). The older `thinkingLevel` enum is rejected by the API.
      ...(opts.thinkingLevel ? { thinkingConfig: { thinkingBudget: -1 } } : {}),
    },
  };
  if (opts.systemInstruction) {
    body.systemInstruction = { parts: [{ text: opts.systemInstruction }] };
  }
  if (opts.tools) body.tools = opts.tools;

  const res = await fetch(
    `${API_BASE}/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${detail.slice(0, 500)}`);
  }

  const json = await res.json();
  const parts: GeminiPart[] = json?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => p.text)
    .filter(Boolean)
    .join("");
  const functionCalls = parts
    .filter((p) => p.functionCall)
    .map((p) => p.functionCall!) as Array<{ name: string; args: Record<string, unknown> }>;
  return { parts, text, functionCalls };
}

// ─── Robust JSON extraction (strip code fences, find object) ─────────────────
export function parseJsonLoose<T>(raw: string): T | null {
  if (!raw) return null;
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(s) as T;
  } catch {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ─── Stage 1: classification ─────────────────────────────────────────────────
const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: [...HARM_CATEGORIES] },
    severity: { type: "integer" },
    rationale: { type: "string" },
    snippets: { type: "array", items: { type: "string" } },
  },
  required: ["category", "severity", "rationale", "snippets"],
};

const CLASSIFY_SYSTEM = `You classify a single workplace email for an employee organizing potential evidence of mistreatment.
Return STRICT JSON matching the schema. Categories:
- harassment: hostile, demeaning, belittling language toward the recipient.
- discrimination: references a protected characteristic (race, sex, age, religion, disability, national origin, pregnancy, etc.).
- threats: intimidation, threats of harm, retaliation, or career damage.
- retaliation: adverse action explicitly tied to a complaint or protected activity.
- defamation: false statements of fact damaging to reputation, shared with others.
- inappropriate: unprofessional or unwelcome personal/romantic conduct.
- benign: nothing harmful.
severity is 0-10 (0 = benign, 10 = egregious). rationale is one or two plain sentences.
snippets are EXACT short quotes copied verbatim from the email that justify the label (empty array if benign).
Never invent text. Only quote what is present.`;

export function mockClassify(subject: string, body: string): ClassificationResult {
  const text = `${subject}\n${body}`.toLowerCase();
  const has = (...w: string[]) => w.some((x) => text.includes(x));
  const grab = (...w: string[]): string[] => {
    const out: string[] = [];
    for (const word of w) {
      const i = text.indexOf(word);
      if (i >= 0) out.push(body.slice(Math.max(0, i - 5), Math.min(body.length, i + word.length + 30)).trim());
    }
    return out.slice(0, 3);
  };
  let category: HarmCategory = "benign";
  let severity = 0;
  if (has("regret it", "never work", "you are gone", "do not test me", "or quit")) {
    category = "threats";
    severity = 9;
  } else if (has("your age", "younger people", "retirement", "your condition", "your doctor", "disability")) {
    category = "discrimination";
    severity = 8;
  } else if (has("complaint", "ran to hr", "troublemakers", "filed a")) {
    category = "retaliation";
    severity = 7;
  } else if (has("liar", "incompetent", "stealing", "fabricated")) {
    category = "defamation";
    severity = 7;
  } else if (has("drinks", "looked nice", "just the two of us")) {
    category = "inappropriate";
    severity = 6;
  } else if (has("stupid", "embarrassing", "monkey", "dead weight", "idiotic", "ashamed")) {
    category = "harassment";
    severity = 7;
  }
  return {
    category,
    severity,
    rationale:
      category === "benign"
        ? "No harmful content detected (heuristic demo classifier)."
        : `Heuristic demo classifier flagged ${category}.`,
    snippets: category === "benign" ? [] : grab(
      "regret it", "never work", "your age", "younger people", "retirement",
      "complaint", "liar", "incompetent", "drinks", "looked nice", "stupid",
      "monkey", "dead weight", "your condition"
    ),
  };
}

// Result of a classification pass, with the true source so callers can record
// honestly whether real Gemini ran or the heuristic fallback was used.
export type ClassifyOutcome = ClassificationResult & { source: "gemini" | "mock" };

export async function classifyEmail(params: {
  apiKey: string | null;
  model: string;
  subject: string;
  body: string;
}): Promise<ClassifyOutcome> {
  const { apiKey, model, subject, body } = params;
  const clean = body.slice(0, 8000);
  if (!apiKey) {
    return { ...mockClassify(subject, clean), source: "mock" };
  }
  const result = await callGemini({
    apiKey,
    model,
    systemInstruction: CLASSIFY_SYSTEM,
    responseSchema: CLASSIFY_SCHEMA,
    temperature: 0,
    contents: [{ role: "user", parts: [{ text: `Subject: ${subject}\n\nBody:\n${clean}` }] }],
  });
  const parsed = parseJsonLoose<ClassificationResult>(result.text);
  if (!parsed || !HARM_CATEGORIES.includes(parsed.category)) {
    // Reachable a valid response but unparseable JSON; treat as a soft failure.
    return { ...mockClassify(subject, clean), source: "mock" };
  }
  return {
    category: parsed.category,
    severity: Math.max(0, Math.min(10, Math.round(Number(parsed.severity) || 0))),
    rationale: String(parsed.rationale ?? ""),
    snippets: Array.isArray(parsed.snippets) ? parsed.snippets.map(String).slice(0, 5) : [],
    source: "gemini",
  };
}

// Lightweight credential/model check: one tiny generateContent call.
// Returns {ok} or {ok:false,error} with the API's message — used by the
// Settings "Test connection" button so failures surface BEFORE a scan.
export async function verifyGeminiKey(
  apiKey: string,
  model: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await callGemini({
      apiKey,
      model,
      temperature: 0,
      contents: [{ role: "user", parts: [{ text: "Reply with the single word: ok" }] }],
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
