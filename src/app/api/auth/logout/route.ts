import { createSupabaseServerClient } from "@/lib/supabase/server";
import { json } from "@/lib/api";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return json({ ok: true });
}
