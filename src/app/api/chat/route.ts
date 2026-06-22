import { createSupabaseServerClient } from "@/lib/supabase/server";
import { handleError } from "@/lib/api";
import { resolveGeminiKey } from "@/lib/settings";
import { runAgent } from "@/lib/agent/run";
import type { Citation } from "@/lib/types";

export const runtime = "nodejs";

type ChatBody = {
  message?: unknown;
  conversationId?: unknown;
};

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const err: { status: number; message: string } = {
        status: 401,
        message: "Unauthorized",
      };
      throw err;
    }
    const userId = user.id;

    const body = (await req.json()) as ChatBody;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const requestedConvId =
      typeof body.conversationId === "string" && body.conversationId
        ? body.conversationId
        : null;

    if (!message) {
      throw { status: 400, message: "Message is required." };
    }

    // Ensure a conversation owned by this user.
    let convId: string | null = null;
    if (requestedConvId) {
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("id", requestedConvId)
        .eq("user_id", userId)
        .maybeSingle();
      if (existing?.id) {
        convId = existing.id;
      }
    }

    if (!convId) {
      const title = message.slice(0, 60);
      const { data: created, error: convErr } = await supabase
        .from("conversations")
        .insert({ user_id: userId, title })
        .select("id")
        .single();
      if (convErr || !created) {
        throw convErr ?? { status: 500, message: "Could not start conversation." };
      }
      convId = created.id;
    }

    // Load prior history (oldest first, cap last 20).
    const { data: historyRows } = await supabase
      .from("chat_messages")
      .select("role,content,created_at")
      .eq("user_id", userId)
      .eq("conversation_id", convId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true });

    const allHistory = (historyRows ?? [])
      .filter((r) => r.role === "user" || r.role === "assistant")
      .map((r) => ({
        role: r.role as "user" | "assistant",
        content: (r.content ?? "") as string,
      }));
    const history = allHistory.slice(-20);

    // Persist the incoming user message.
    await supabase.from("chat_messages").insert({
      user_id: userId,
      conversation_id: convId,
      role: "user",
      content: message,
    });

    const { key, chatModel } = await resolveGeminiKey(supabase, userId);

    const { answer, citations } = await runAgent({
      supabase,
      userId,
      apiKey: key,
      model: chatModel,
      history,
      userMessage: message,
    });

    const safeCitations: Citation[] = Array.isArray(citations) ? citations : [];

    // Persist the assistant message.
    await supabase.from("chat_messages").insert({
      user_id: userId,
      conversation_id: convId,
      role: "assistant",
      content: answer,
      citations: safeCitations,
    });

    const encoder = new TextEncoder();
    const finalConvId = convId;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const words = (answer ?? "").split(/(\s+)/);
          let chunk = "";
          let wordCount = 0;

          const flush = async () => {
            if (chunk) {
              controller.enqueue(encoder.encode(chunk));
              chunk = "";
              await new Promise((resolve) => setTimeout(resolve, 12));
            }
          };

          for (const token of words) {
            chunk += token;
            if (token.trim()) {
              wordCount += 1;
            }
            if (wordCount >= 3) {
              await flush();
              wordCount = 0;
            }
          }
          await flush();

          controller.enqueue(
            encoder.encode("\n\n[[CITATIONS]]" + JSON.stringify(safeCitations)),
          );
          controller.close();
        } catch (streamErr) {
          controller.error(streamErr);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "x-conversation-id": finalConvId ?? "",
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
