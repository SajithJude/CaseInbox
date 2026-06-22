import { requireUserId } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { json, handleError } from "@/lib/api";
import { resolveGeminiKey } from "@/lib/settings";
import { verifyGeminiKey } from "@/lib/gemini";

export const runtime = "nodejs";

// Confirms the user's stored Gemini key can actually call the configured
// models, so failures surface here instead of silently degrading a scan.
export async function POST() {
  try {
    const userId = await requireUserId();
    const supabase = await createSupabaseServerClient();
    const { key, classifyModel, chatModel } = await resolveGeminiKey(supabase, userId);

    if (!key) {
      return json({
        ok: false,
        configured: false,
        error:
          "No Gemini API key on file. Save your key above (or set GEMINI_API_KEY) to use real AI; without it, results use a built-in heuristic.",
      });
    }

    const classify = await verifyGeminiKey(key, classifyModel);
    const chat = await verifyGeminiKey(key, chatModel);

    const ok = classify.ok && chat.ok;
    return json({
      ok,
      configured: true,
      classifyModel,
      chatModel,
      classify,
      chat,
      error: ok ? undefined : classify.error || chat.error,
    });
  } catch (err) {
    return handleError(err);
  }
}
