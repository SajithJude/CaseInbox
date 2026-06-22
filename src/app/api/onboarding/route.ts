import { requireUserId } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { json, apiError, handleError } from "@/lib/api";
import { resolveGeminiKey } from "@/lib/settings";
import { runOnboardingAgent } from "@/lib/agent/onboarding";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  message?: unknown;
  history?: unknown;
};

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = (await req.json().catch(() => ({}))) as Body;

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return apiError("Message is required.");

    const history = Array.isArray(body.history)
      ? body.history
          .filter(
            (m): m is { role: "user" | "assistant"; content: string } =>
              !!m &&
              typeof (m as { content?: unknown }).content === "string" &&
              ((m as { role?: unknown }).role === "user" ||
                (m as { role?: unknown }).role === "assistant")
          )
          .slice(-12)
      : [];

    const supabase = await createSupabaseServerClient();
    const { key, chatModel } = await resolveGeminiKey(supabase, userId);

    const turn = await runOnboardingAgent({
      supabase,
      userId,
      apiKey: key,
      model: chatModel,
      history,
      userMessage: message,
      now: new Date(),
    });

    return json(turn);
  } catch (err) {
    return handleError(err);
  }
}
