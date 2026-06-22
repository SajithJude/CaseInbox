import { requireUserId } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { json, handleError } from "@/lib/api";

export const runtime = "nodejs";

export async function POST() {
  try {
    const userId = await requireUserId();
    const supabase = await createSupabaseServerClient();
    await supabase.from("gmail_connections").delete().eq("user_id", userId);
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
