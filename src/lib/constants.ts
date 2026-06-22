// Shared constants for CaseInbox.

export const HARM_CATEGORIES = [
  "harassment",
  "discrimination",
  "threats",
  "retaliation",
  "defamation",
  "inappropriate",
  "benign",
] as const;

export type HarmCategory = (typeof HARM_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<HarmCategory, string> = {
  harassment: "Harassment / hostile language",
  discrimination: "Discrimination (protected characteristic)",
  threats: "Threats or intimidation",
  retaliation: "Retaliation",
  defamation: "Defamatory / demeaning statements",
  inappropriate: "Inappropriate / unprofessional",
  benign: "None / benign",
};

export const CATEGORY_SHORT: Record<HarmCategory, string> = {
  harassment: "Harassment",
  discrimination: "Discrimination",
  threats: "Threats",
  retaliation: "Retaliation",
  defamation: "Defamation",
  inappropriate: "Inappropriate",
  benign: "Benign",
};

// Restrained color cues per PRD §7 — never sensationalized.
export const CATEGORY_COLORS: Record<HarmCategory, string> = {
  harassment: "#b45309",
  discrimination: "#9333ea",
  threats: "#b91c1c",
  retaliation: "#c2410c",
  defamation: "#0f766e",
  inappropriate: "#a16207",
  benign: "#64748b",
};

// Current GA Gemini model IDs (verified June 2026). The 2.5 family is the
// stable, generally-available line: Flash-Lite for cheap bulk classification,
// Flash for the agent, Pro for harder reasoning.
export const MODELS = {
  classify: "gemini-2.5-flash-lite",
  chat: "gemini-2.5-flash",
  chatPro: "gemini-2.5-pro",
} as const;

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export const DISCLAIMER_SHORT =
  "CaseInbox helps you organize your own emails. It is not legal advice. AI labels are interpretations, not legal findings. Consult a licensed employment attorney, and do not delete or alter emails that may be relevant to a dispute.";

export const DISCLAIMER_FULL = [
  "CaseInbox is an organization and triage tool for your own mailbox. It is not a lawyer and does not provide legal advice, nor does it predict the outcome of any claim.",
  "Every category, severity score, and summary shown here is AI-generated interpretation — not a finding of fact. Classification is imperfect and will produce false positives and false negatives. You review and decide what matters.",
  "Originals are preserved exactly as received, including full headers. Nothing is sent, deleted, labeled, or modified in your mailbox — access is strictly read-only.",
  "Consult a licensed employment attorney about your situation. Do not delete or alter any emails that may be relevant to a dispute (doing so may constitute spoliation).",
] as const;

export const AI_NOTICE = "AI-generated analysis — not a legal finding.";
