import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUserId } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { json, apiError, handleError } from "@/lib/api";
import {
  gmailClientFromTokens,
  buildGmailQuery,
  listMessageIds,
  getMessage,
} from "@/lib/gmail";
import { cleanForAnalysis } from "@/lib/email-clean";
import { resolveGeminiKey } from "@/lib/settings";
import { classifyEmail } from "@/lib/gemini";
import { decryptSecret } from "@/lib/crypto";
import type { ScanJob, ScanScope } from "@/lib/types";

export const runtime = "nodejs";

const BATCH_SIZE = 8; // messages processed per GET call to keep requests fast.

type JobRow = {
  id: string;
  user_id: string;
  scope: ScanScope;
  status: ScanJob["status"];
  total: number;
  processed: number;
  failed: number;
  error: string | null;
  page_token: string | null;
};

function publicJob(job: JobRow) {
  return {
    id: job.id,
    status: job.status,
    total: job.total,
    processed: job.processed,
    failed: job.failed,
    error: job.error,
    scope: job.scope,
  };
}

async function failJob(supabase: SupabaseClient, jobId: string, message: string) {
  await supabase
    .from("scan_jobs")
    .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userId = await requireUserId();
    const supabase = await createSupabaseServerClient();

    const { data: jobData, error: jobError } = await supabase
      .from("scan_jobs")
      .select("id, user_id, scope, status, total, processed, failed, error, page_token")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (jobError || !jobData) {
      return apiError("Scan job not found.", 404);
    }

    let job = jobData as JobRow;

    // Only advance work when queued or running; terminal states return as-is.
    if (job.status !== "queued" && job.status !== "running") {
      return json(publicJob(job));
    }

    // Load Gmail connection (read-only access).
    const { data: connRow } = await supabase
      .from("gmail_connections")
      .select("access_token_encrypted, refresh_token_encrypted, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (!connRow || connRow.status !== "connected") {
      await failJob(supabase, job.id, "Gmail not connected.");
      const refreshed = { ...job, status: "failed" as const, error: "Gmail not connected." };
      return json(publicJob(refreshed));
    }

    let accessToken: string | null = null;
    let refreshToken: string | undefined;
    try {
      if (connRow.access_token_encrypted) {
        accessToken = decryptSecret(connRow.access_token_encrypted as string);
      }
      if (connRow.refresh_token_encrypted) {
        refreshToken = decryptSecret(connRow.refresh_token_encrypted as string);
      }
    } catch {
      await failJob(supabase, job.id, "Stored Gmail credentials could not be read.");
      const refreshed = {
        ...job,
        status: "failed" as const,
        error: "Stored Gmail credentials could not be read.",
      };
      return json(publicJob(refreshed));
    }

    if (!accessToken && !refreshToken) {
      await failJob(supabase, job.id, "Gmail credentials missing.");
      const refreshed = { ...job, status: "failed" as const, error: "Gmail credentials missing." };
      return json(publicJob(refreshed));
    }

    const gmail = gmailClientFromTokens(accessToken ?? "", refreshToken);
    const scope = job.scope ?? {};
    const query = buildGmailQuery(scope);
    const cap = Math.max(1, Math.min(Number(scope.maxMessages) || 50, 50));

    // First run: fetch the first page of ids and set totals.
    if (job.status === "queued") {
      let firstPage;
      try {
        firstPage = await listMessageIds(gmail, query, undefined, cap);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not list messages.";
        await failJob(supabase, job.id, msg);
        const refreshed = { ...job, status: "failed" as const, error: msg };
        return json(publicJob(refreshed));
      }

      const total = Math.min(firstPage.ids.length, cap);
      const remainingToken = firstPage.ids.length >= cap ? null : firstPage.nextPageToken;

      if (total === 0) {
        await supabase
          .from("scan_jobs")
          .update({
            status: "completed",
            total: 0,
            processed: 0,
            page_token: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        return json(publicJob({ ...job, status: "completed", total: 0, processed: 0, page_token: null }));
      }

      await supabase
        .from("scan_jobs")
        .update({
          status: "running",
          total,
          page_token: remainingToken,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      job = { ...job, status: "running", total, page_token: remainingToken };
    }

    // Determine which message ids still need processing in this batch.
    const remainingCount = Math.max(0, job.total - job.processed - job.failed);
    if (remainingCount <= 0) {
      await supabase
        .from("scan_jobs")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", job.id);
      return json(publicJob({ ...job, status: "completed" }));
    }

    // Re-list ids deterministically up to cap, then slice the window we still owe.
    // listMessageIds returns ids in a stable order for the same query.
    let ids: string[] = [];
    try {
      const page = await listMessageIds(gmail, query, undefined, cap);
      ids = page.ids.slice(0, job.total);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not list messages.";
      await failJob(supabase, job.id, msg);
      return json(publicJob({ ...job, status: "failed", error: msg }));
    }

    const startIndex = job.processed + job.failed;
    const window = ids.slice(startIndex, startIndex + BATCH_SIZE);

    const { key, classifyModel } = await resolveGeminiKey(supabase, userId);

    let processed = job.processed;
    let failed = job.failed;

    for (const messageId of window) {
      try {
        // Skip if we already have this email for this user (idempotent/resumable).
        const { data: existing } = await supabase
          .from("emails")
          .select("id")
          .eq("user_id", userId)
          .eq("gmail_message_id", messageId)
          .maybeSingle();

        let emailId = existing?.id as string | undefined;
        let subject = "";
        let analysisBody = "";

        if (!emailId) {
          const msg = await getMessage(gmail, messageId);
          subject = msg.subject;
          analysisBody = cleanForAnalysis(msg.bodyText);

          const { data: inserted, error: insErr } = await supabase
            .from("emails")
            .insert({
              user_id: userId,
              scan_job_id: job.id,
              gmail_message_id: msg.gmailMessageId,
              thread_id: msg.threadId,
              from_addr: msg.from,
              to_addrs: msg.to,
              cc_addrs: msg.cc,
              sent_at: msg.sentAt,
              subject: msg.subject,
              snippet: msg.snippet,
              body_text: msg.bodyText,
              body_html: msg.bodyHtml,
              raw_eml: msg.rawEml,
              has_attachments: msg.hasAttachments,
            })
            .select("id")
            .single();

          if (insErr || !inserted) {
            throw new Error(insErr?.message || "Insert failed");
          }
          emailId = inserted.id as string;
        } else {
          // Already stored; fetch the fields we need to (re)classify.
          const { data: stored } = await supabase
            .from("emails")
            .select("subject, body_text")
            .eq("id", emailId)
            .single();
          subject = (stored?.subject as string) ?? "";
          analysisBody = cleanForAnalysis((stored?.body_text as string) ?? "");
        }

        const result = await classifyEmail({
          apiKey: key,
          model: classifyModel,
          subject,
          body: analysisBody,
        });

        await supabase.from("classifications").upsert(
          {
            email_id: emailId,
            user_id: userId,
            category: result.category,
            severity: result.severity,
            rationale: result.rationale,
            snippets: result.snippets,
            model_version: result.source === "gemini" ? classifyModel : "mock",
          },
          { onConflict: "email_id" }
        );

        processed += 1;
      } catch {
        // Resumable per-message failure: count and continue (PRD §9.5).
        failed += 1;
      }
    }

    const allDone = processed + failed >= job.total;
    const nextStatus: ScanJob["status"] = allDone ? "completed" : "running";

    await supabase
      .from("scan_jobs")
      .update({
        processed,
        failed,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return json(publicJob({ ...job, processed, failed, status: nextStatus }));
  } catch (err) {
    return handleError(err);
  }
}
