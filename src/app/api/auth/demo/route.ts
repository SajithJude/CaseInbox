import { createSupabaseServerClient } from "@/lib/supabase/server";
import { apiError, json } from "@/lib/api";

// Signs the visitor into the shared, pre-seeded demo account (PRD demo mode).
export async function POST() {
  if (process.env.NEXT_PUBLIC_DEMO_ENABLED !== "true") {
    return apiError("Demo mode is disabled.", 403);
  }
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) return apiError("Demo account is not configured.", 500);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return apiError(error.message, 500);
  return json({ ok: true });
}
