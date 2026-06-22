import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gmailConfigured } from "@/lib/gmail";
import type { ScanJob } from "@/lib/types";
import ConnectClient from "@/components/connect/ConnectClient";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_demo")
    .eq("id", user.id)
    .maybeSingle();

  const { data: connectionRow } = await supabase
    .from("gmail_connections")
    .select("status, email")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: jobRows } = await supabase
    .from("scan_jobs")
    .select("id, status, total, processed, failed, error, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const connection = connectionRow
    ? { status: connectionRow.status as string, email: (connectionRow.email as string | null) ?? null }
    : null;

  const recentJobs = (jobRows ?? []).map((j) => ({
    id: j.id as string,
    status: j.status as ScanJob["status"],
    total: (j.total as number) ?? 0,
    processed: (j.processed as number) ?? 0,
    failed: (j.failed as number) ?? 0,
    error: (j.error as string | null) ?? null,
    created_at: j.created_at as string,
  }));

  return (
    <ConnectClient
      connection={connection}
      configured={gmailConfigured()}
      recentJobs={recentJobs}
      demo={Boolean(profile?.is_demo)}
    />
  );
}
