import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { HARM_CATEGORIES, type HarmCategory } from "@/lib/constants";
import type {
  Classification,
  EmailWithClassification,
  Profile,
  ScanJob,
} from "@/lib/types";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

export interface DashboardSummary {
  total: number;
  highSeverity: number;
  byCategory: Record<HarmCategory, number>;
}

type RawClassification = Omit<Classification, "email_id" | "user_id" | "created_at"> & {
  id: string;
};

type RawEmailRow = {
  id: string;
  gmail_message_id: string;
  thread_id: string | null;
  from_addr: string | null;
  to_addrs: string | null;
  cc_addrs: string | null;
  sent_at: string | null;
  subject: string | null;
  snippet: string | null;
  classification: RawClassification[] | null;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const sp = await searchParams;
  const initialEmailId = sp.email;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const uid = user.id;

  const [emailsRes, profileRes, caseRes, scanRes] = await Promise.all([
    supabase
      .from("emails")
      .select(
        "id,gmail_message_id,thread_id,from_addr,to_addrs,cc_addrs,sent_at,subject,snippet,classification:classifications(id,category,severity,rationale,snippets,model_version)"
      )
      .eq("user_id", uid)
      .order("sent_at", { ascending: false }),
    supabase.from("profiles").select("*").eq("id", uid).single(),
    supabase.from("case_items").select("email_id").eq("user_id", uid),
    supabase
      .from("scan_jobs")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const rawRows = (emailsRes.data ?? []) as RawEmailRow[];
  const flaggedIds = new Set(
    ((caseRes.data ?? []) as { email_id: string }[]).map((r) => r.email_id)
  );
  const profile = (profileRes.data as Profile | null) ?? null;
  const latestScan = ((scanRes.data ?? []) as ScanJob[])[0] ?? null;

  const emails: EmailWithClassification[] = rawRows.map((row) => {
    const c = row.classification && row.classification.length > 0 ? row.classification[0] : null;
    const classification: Classification | null = c
      ? {
          id: c.id,
          email_id: row.id,
          user_id: uid,
          category: c.category,
          severity: c.severity,
          rationale: c.rationale,
          snippets: Array.isArray(c.snippets) ? c.snippets : [],
          model_version: c.model_version,
          created_at: "",
        }
      : null;
    return {
      id: row.id,
      user_id: uid,
      scan_job_id: null,
      gmail_message_id: row.gmail_message_id,
      thread_id: row.thread_id,
      from_addr: row.from_addr,
      to_addrs: row.to_addrs,
      cc_addrs: row.cc_addrs,
      sent_at: row.sent_at,
      subject: row.subject,
      snippet: row.snippet,
      body_text: null,
      body_html: null,
      raw_eml: null,
      has_attachments: false,
      created_at: "",
      classification,
      flagged: flaggedIds.has(row.id),
    };
  });

  const byCategory = HARM_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = 0;
    return acc;
  }, {} as Record<HarmCategory, number>);

  let highSeverity = 0;
  let analyzed = 0;
  for (const e of emails) {
    if (e.classification) {
      analyzed += 1;
      byCategory[e.classification.category] += 1;
      if (e.classification.severity >= 7) highSeverity += 1;
    }
  }

  const summary: DashboardSummary = {
    total: analyzed,
    highSeverity,
    byCategory,
  };

  if (emails.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Card className="p-10 text-center">
          <h1 className="text-xl font-semibold text-ink">No emails analyzed yet</h1>
          <p className="mx-auto mt-3 max-w-prose text-sm text-slate-600">
            CaseInbox reads your mailbox read-only, preserves every message exactly as received,
            and adds a calm AI triage layer on top. Connect your inbox to run your first scan.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href="/connect"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              Run your first scan
            </Link>
          </div>
          {profile && !profile.is_demo && (
            <p className="mt-6 text-xs text-slate-500">
              Just exploring? You can load a built-in demo dataset to see how the dashboard looks
              before connecting your own mailbox.
            </p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          {emails.length} message{emails.length === 1 ? "" : "s"} preserved
          {latestScan?.updated_at ? `, last scan ${latestScan.status}` : ""}.
        </p>
      </header>
      <DashboardClient emails={emails} summary={summary} initialEmailId={initialEmailId} />
    </div>
  );
}
