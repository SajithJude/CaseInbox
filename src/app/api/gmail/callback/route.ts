import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  gmailConfigured,
  exchangeCode,
  gmailClientFromTokens,
} from "@/lib/gmail";
import { encryptSecret } from "@/lib/crypto";
import { GMAIL_READONLY_SCOPE } from "@/lib/constants";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!gmailConfigured()) {
    redirect("/connect?error=not_configured");
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // state = "<userId>:<returnKey>"; verify the user and pick where to land.
  const [stateUserId, returnKey] = (state ?? "").split(":");
  const returnPath = returnKey === "onboarding" ? "/onboarding" : "/connect";

  if (!code) {
    redirect(`${returnPath}?error=missing_code`);
  }
  if (!stateUserId || stateUserId !== user!.id) {
    redirect(`${returnPath}?error=state_mismatch`);
  }

  let connectionEmail: string | null = null;

  try {
    const tokens = await exchangeCode(code!);
    const accessToken = tokens.access_token ?? null;
    const refreshToken = tokens.refresh_token ?? null;
    const expiry = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null;
    const scope = tokens.scope ?? GMAIL_READONLY_SCOPE;

    // Best-effort fetch of the connected email address.
    if (accessToken) {
      try {
        const gmail = gmailClientFromTokens(accessToken, refreshToken ?? undefined);
        const profile = await gmail.users.getProfile({ userId: "me" });
        connectionEmail = profile.data.emailAddress ?? null;
      } catch {
        connectionEmail = null;
      }
    }

    const supabase = await createSupabaseServerClient();
    await supabase.from("gmail_connections").upsert(
      {
        user_id: user.id,
        email: connectionEmail,
        refresh_token_encrypted: refreshToken ? encryptSecret(refreshToken) : null,
        access_token_encrypted: accessToken ? encryptSecret(accessToken) : null,
        token_expiry: expiry,
        scope,
        status: "connected",
      },
      { onConflict: "user_id" }
    );
  } catch {
    redirect(`${returnPath}?error=oauth_failed`);
  }

  redirect(`${returnPath}?connected=1`);
}
