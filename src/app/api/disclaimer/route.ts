import { createSupabaseServerClient } from "@/lib/supabase/server";
import { apiError, json } from "@/lib/api";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  const { error } = await supabase
    .from("profiles")
    .update({ disclaimer_acknowledged_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return apiError(error.message, 500);
  return json({ ok: true });
}
