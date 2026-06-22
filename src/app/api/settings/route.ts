import { requireUserId } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { json, apiError, handleError } from "@/lib/api";
import { encryptSecret, keyHint } from "@/lib/crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));

    const update: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };

    if (typeof body?.gemini_key === "string" && body.gemini_key.trim()) {
      const plain = body.gemini_key.trim();
      update.gemini_key_encrypted = encryptSecret(plain);
      update.gemini_key_hint = keyHint(plain);
    }
    if (typeof body?.classify_model === "string" && body.classify_model.trim()) {
      update.classify_model = body.classify_model.trim();
    }
    if (typeof body?.chat_model === "string" && body.chat_model.trim()) {
      update.chat_model = body.chat_model.trim();
    }

    if (Object.keys(update).length <= 2) {
      return apiError("No settings provided.");
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("user_settings")
      .upsert(update, { onConflict: "user_id" });

    if (error) {
      return apiError(error.message, 500);
    }

    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
