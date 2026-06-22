import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MODELS } from "@/lib/constants";
import SettingsClient from "@/components/settings/SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();

  const { data: settings } = await supabase
    .from("user_settings")
    .select("gemini_key_hint, classify_model, chat_model")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: connRow } = await supabase
    .from("gmail_connections")
    .select("status, email")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <SettingsClient
      keyHint={(settings?.gemini_key_hint as string | null) ?? null}
      classifyModel={(settings?.classify_model as string) || MODELS.classify}
      chatModel={(settings?.chat_model as string) || MODELS.chat}
      gmail={
        connRow
          ? { status: connRow.status as string, email: (connRow.email as string | null) ?? null }
          : null
      }
    />
  );
}
