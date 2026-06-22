import { createSupabaseServerClient } from "@/lib/supabase/server";
import { apiError, json } from "@/lib/api";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) return apiError("Email and password are required.");
  if (String(password).length < 8) return apiError("Password must be at least 8 characters.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return apiError(error.message, 400);
  // If email confirmation is enabled, there is no session yet.
  if (!data.session) return json({ ok: true, needsConfirmation: true });
  return json({ ok: true });
}
