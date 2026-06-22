import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/AppNav";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, is_demo, disclaimer_acknowledged_at")
    .eq("id", user.id)
    .maybeSingle();

  // Require disclaimer acknowledgement before using the app (PRD §6).
  if (profile && !profile.disclaimer_acknowledged_at) {
    redirect("/disclaimer");
  }

  const { count } = await supabase
    .from("case_items")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  return (
    <div className="flex min-h-screen flex-col">
      <DisclaimerBanner />
      <AppNav
        email={profile?.email ?? user.email ?? ""}
        caseCount={count ?? 0}
        isDemo={Boolean(profile?.is_demo)}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-400">
        CaseInbox is an organizational tool for your own email and is not legal advice. Consult a
        licensed employment attorney. Do not delete or alter emails relevant to a dispute.
      </footer>
    </div>
  );
}
