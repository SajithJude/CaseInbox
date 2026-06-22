import { requireUserId } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { json, apiError, handleError } from "@/lib/api";
import type { ScanScope } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const rawScope = (body?.scope ?? {}) as Partial<ScanScope>;

    const maxMessages = Math.max(1, Math.min(50, Number(rawScope.maxMessages) || 50));
    const scope: ScanScope = {
      from: rawScope.from?.toString().trim() || undefined,
      to: rawScope.to?.toString().trim() || undefined,
      after: rawScope.after?.toString().trim() || undefined,
      before: rawScope.before?.toString().trim() || undefined,
      label: rawScope.label?.toString().trim() || undefined,
      query: rawScope.query?.toString().trim() || undefined,
      maxMessages,
    };

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("scan_jobs")
      .insert({
        user_id: userId,
        scope,
        status: "queued",
        total: 0,
        processed: 0,
        failed: 0,
      })
      .select("id")
      .single();

    if (error || !data) {
      return apiError(error?.message || "Could not create scan job.", 500);
    }

    // The job is queued; the client polls GET /api/scan/[id] which advances batches.
    return json({ jobId: data.id });
  } catch (err) {
    return handleError(err);
  }
}
