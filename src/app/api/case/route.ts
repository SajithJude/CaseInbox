import { requireUserId } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { json, apiError, handleError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CaseBody {
  email_id?: unknown;
  note?: unknown;
}

function readEmailId(body: CaseBody): string | null {
  return typeof body.email_id === "string" && body.email_id.length > 0
    ? body.email_id
    : null;
}

function readNote(body: CaseBody): string | null {
  if (typeof body.note === "string") return body.note;
  return null;
}

// Flag an email into the case folder (idempotent).
export async function POST(req: Request) {
  try {
    const uid = await requireUserId();
    const body = (await req.json().catch(() => ({}))) as CaseBody;
    const emailId = readEmailId(body);
    if (!emailId) return apiError("email_id is required", 400);

    const supabase = await createSupabaseServerClient();
    const note = readNote(body);

    const { error } = await supabase
      .from("case_items")
      .upsert(
        {
          user_id: uid,
          email_id: emailId,
          ...(note !== null ? { user_note: note } : {}),
        },
        { onConflict: "user_id,email_id" }
      );

    if (error) return apiError(error.message, 400);
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

// Update the note for a flagged email.
export async function PATCH(req: Request) {
  try {
    const uid = await requireUserId();
    const body = (await req.json().catch(() => ({}))) as CaseBody;
    const emailId = readEmailId(body);
    if (!emailId) return apiError("email_id is required", 400);

    const supabase = await createSupabaseServerClient();
    const note = readNote(body);

    const { error } = await supabase
      .from("case_items")
      .update({ user_note: note })
      .eq("user_id", uid)
      .eq("email_id", emailId);

    if (error) return apiError(error.message, 400);
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

// Remove an email from the case folder.
export async function DELETE(req: Request) {
  try {
    const uid = await requireUserId();
    const body = (await req.json().catch(() => ({}))) as CaseBody;
    const emailId = readEmailId(body);
    if (!emailId) return apiError("email_id is required", 400);

    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("case_items")
      .delete()
      .eq("user_id", uid)
      .eq("email_id", emailId);

    if (error) return apiError(error.message, 400);
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
