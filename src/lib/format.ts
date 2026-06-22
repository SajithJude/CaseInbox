// Client-safe formatting helpers (no Node-only imports).
import { CATEGORY_COLORS, CATEGORY_SHORT, type HarmCategory } from "./constants";

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function severityLabel(sev: number): string {
  if (sev <= 0) return "None";
  if (sev <= 3) return "Low";
  if (sev <= 6) return "Moderate";
  if (sev <= 8) return "High";
  return "Severe";
}

export function categoryColor(cat: HarmCategory): string {
  return CATEGORY_COLORS[cat] ?? "#64748b";
}

export function categoryShort(cat: HarmCategory): string {
  return CATEGORY_SHORT[cat] ?? cat;
}

// Parse a sender header "Name <email@x>" into display parts.
export function parseAddress(addr: string | null | undefined): { name: string; email: string } {
  if (!addr) return { name: "", email: "" };
  const m = addr.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: "", email: addr.trim() };
}
