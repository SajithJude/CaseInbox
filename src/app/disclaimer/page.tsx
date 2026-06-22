import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DISCLAIMER_FULL } from "@/lib/constants";
import { AcknowledgeButton } from "@/components/AcknowledgeButton";

export const dynamic = "force-dynamic";

export default async function DisclaimerPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("disclaimer_acknowledged_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.disclaimer_acknowledged_at) redirect("/dashboard");

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Before you begin</h1>
        <p className="mt-2 text-sm text-slate-500">
          Please read and acknowledge how CaseInbox works.
        </p>
        <ul className="mt-5 space-y-3 text-sm text-slate-600">
          {DISCLAIMER_FULL.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              {line}
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <AcknowledgeButton />
        </div>
      </div>
    </div>
  );
}
