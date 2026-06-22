import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gmailConfigured } from "@/lib/gmail";
import { OnboardingChat } from "@/components/onboarding/OnboardingChat";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: conn } = await supabase
    .from("gmail_connections")
    .select("email, status")
    .eq("user_id", user.id)
    .maybeSingle();

  const { count: emailCount } = await supabase
    .from("emails")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const connected = Boolean(conn && conn.status === "connected");

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-ink">Let&apos;s set up your scan</h1>
        <p className="mt-1 text-sm text-slate-600">
          Describe in plain language what you&apos;re looking for — who it&apos;s from and roughly when —
          and I&apos;ll connect your inbox (read-only) and run a focused scan for you.
        </p>
      </header>
      <OnboardingChat
        configured={gmailConfigured()}
        connected={connected}
        connectedEmail={conn?.email ?? null}
        justConnected={sp.connected === "1"}
        oauthError={sp.error ?? null}
        hasExistingEmails={(emailCount ?? 0) > 0}
      />
    </div>
  );
}
