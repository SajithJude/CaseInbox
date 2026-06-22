import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import { json, apiError, handleError } from "@/lib/api";
import { sanitizeEmailHtml } from "@/lib/email-clean";
import type { Classification, EmailRecord } from "@/lib/types";

export const runtime = "nodejs";

type RawClassification = {
  id: string;
  email_id: string;
  user_id: string;
  category: Classification["category"];
  severity: number;
  rationale: string | null;
  snippets: unknown;
  model_version: string | null;
  created_at: string;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await requireUserId();
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("emails")
      .select("*, classification:classifications(*)")
      .eq("user_id", userId)
      .eq("id", id)
      .single();

    if (error || !data) {
      return apiError("Not found", 404);
    }

    const row = data as EmailRecord & { classification: RawClassification[] | null };
    const rawClassification =
      row.classification && row.classification.length > 0 ? row.classification[0] : null;

    const classification: Classification | null = rawClassification
      ? {
          id: rawClassification.id,
          email_id: rawClassification.email_id,
          user_id: rawClassification.user_id,
          category: rawClassification.category,
          severity: rawClassification.severity,
          rationale: rawClassification.rationale,
          snippets: Array.isArray(rawClassification.snippets)
            ? (rawClassification.snippets as string[])
            : [],
          model_version: rawClassification.model_version,
          created_at: rawClassification.created_at,
        }
      : null;

    const { classification: _omit, ...emailFields } = row;
    const email = emailFields as EmailRecord;

    const safeHtml = email.body_html ? sanitizeEmailHtml(email.body_html) : "";

    const { data: caseItem } = await supabase
      .from("case_items")
      .select("id,user_note")
      .eq("user_id", userId)
      .eq("email_id", id)
      .maybeSingle();

    return json({
      email,
      classification,
      safeHtml,
      flagged: Boolean(caseItem),
      note: (caseItem as { user_note: string | null } | null)?.user_note ?? null,
    });
  } catch (err) {
    return handleError(err);
  }
}
