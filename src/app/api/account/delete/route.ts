import { requireUserId } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { json, handleError } from "@/lib/api";

export const runtime = "nodejs";

// Purge all of the user's data. RLS already scopes to the user; we also filter
// explicitly by user_id. Deleting the auth user requires admin and is out of scope.
export async function POST() {
  try {
    const userId = await requireUserId();
    const supabase = await createSupabaseServerClient();

    // Order matters for FK references: children before parents.
    const tables = [
      "chat_messages",
      "conversations",
      "case_items",
      "classifications",
      "emails",
      "scan_jobs",
      "gmail_connections",
      "user_settings",
    ];

    for (const table of tables) {
      await supabase.from(table).delete().eq("user_id", userId);
    }

    await supabase.auth.signOut();

    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
