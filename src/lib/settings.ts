import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "./crypto";
import { MODELS } from "./constants";
import type { UserSettings } from "./types";

// Resolve the Gemini API key to use for a user: their stored BYO key if present,
// otherwise the optional server fallback (GEMINI_API_KEY), otherwise null (→ mock).
export async function resolveGeminiKey(
  supabase: SupabaseClient,
  userId: string
): Promise<{ key: string | null; classifyModel: string; chatModel: string }> {
  const { data } = await supabase
    .from("user_settings")
    .select("gemini_key_encrypted, classify_model, chat_model")
    .eq("user_id", userId)
    .maybeSingle();

  const settings = data as Pick<UserSettings, "gemini_key_encrypted" | "classify_model" | "chat_model"> | null;

  let key: string | null = null;
  if (settings?.gemini_key_encrypted) {
    try {
      key = decryptSecret(settings.gemini_key_encrypted);
    } catch {
      key = null;
    }
  }
  if (!key && process.env.GEMINI_API_KEY) key = process.env.GEMINI_API_KEY;

  return {
    key,
    classifyModel: settings?.classify_model || MODELS.classify,
    chatModel: settings?.chat_model || MODELS.chat,
  };
}
