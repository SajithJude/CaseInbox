import { createSupabaseServerClient } from "@/lib/supabase/server";
import { apiError, json } from "@/lib/api";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) return apiError("Email and password are required.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return apiError(error.message, 401);
  return json({ ok: true });
}
