import { requireUserId } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CaseClient, type CaseClientItem } from "@/components/case/CaseClient";

export const dynamic = "force-dynamic";

type RawClassification = {
  category: CaseClientItem["category"];
  severity: number | null;
  rationale: string | null;
  snippets: string[] | null;
};

type RawEmail = {
  id: string;
  gmail_message_id: string | null;
  thread_id: string | null;
  from_addr: string | null;
  to_addrs: string | null;
  cc_addrs: string | null;
  sent_at: string | null;
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  classification: RawClassification[] | null;
};

type RawCaseRow = {
  id: string;
  user_note: string | null;
  added_at: string;
  email: RawEmail | RawEmail[] | null;
};

export default async function CasePage() {
  const uid = await requireUserId();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("case_items")
    .select(
      "id,user_note,added_at,email:emails(id,gmail_message_id,thread_id,from_addr,to_addrs,cc_addrs,sent_at,subject,snippet,body_text,classification:classifications(category,severity,rationale,snippets))"
    )
    .eq("user_id", uid)
    .order("added_at", { ascending: false });

  const rows = (error ? [] : ((data ?? []) as unknown as RawCaseRow[])) || [];

  const items: CaseClientItem[] = rows
    .map((row) => {
      const email = Array.isArray(row.email) ? row.email[0] : row.email;
      if (!email) return null;
      const cls = Array.isArray(email.classification)
        ? email.classification[0]
        : email.classification ?? null;
      const item: CaseClientItem = {
        case_item_id: row.id,
        email_id: email.id,
        user_note: row.user_note,
        added_at: row.added_at,
        gmail_message_id: email.gmail_message_id,
        thread_id: email.thread_id,
        from_addr: email.from_addr,
        to_addrs: email.to_addrs,
        cc_addrs: email.cc_addrs,
        sent_at: email.sent_at,
        subject: email.subject,
        snippet: email.snippet,
        body_text: email.body_text,
        category: cls?.category ?? null,
        severity: typeof cls?.severity === "number" ? cls.severity : null,
        rationale: cls?.rationale ?? null,
        snippets: Array.isArray(cls?.snippets) ? (cls?.snippets as string[]) : [],
      };
      return item;
    })
    .filter((x): x is CaseClientItem => x !== null);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Case folder</h1>
        <p className="mt-1 text-sm text-slate-600">
          Emails you have flagged for your records. Originals are preserved exactly as received,
          including full headers. AI analysis is kept separate from the original content.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-medium text-ink">No flagged emails yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Flag an email to add it here. You can add an email to your case folder from the
            Dashboard (use the flag action on any reviewed email) or from a citation in Chat.
            Flagged emails can be exported as a preservation-grade evidence package or a summary
            report.
          </p>
        </div>
      ) : (
        <CaseClient items={items} />
      )}
    </main>
  );
}
