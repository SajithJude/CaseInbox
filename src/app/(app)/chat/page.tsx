import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Citation } from "@/lib/types";
import ChatClient from "@/components/chat/ChatClient";

export const dynamic = "force-dynamic";

type InitialMessage = {
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
};

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const conversationId: string | null = conversation?.id ?? null;

  let initialMessages: InitialMessage[] = [];

  if (conversationId) {
    const { data: rows } = await supabase
      .from("chat_messages")
      .select("id,role,content,citations,created_at")
      .eq("user_id", user.id)
      .eq("conversation_id", conversationId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true });

    initialMessages = (rows ?? []).map((row) => ({
      role: row.role as "user" | "assistant",
      content: row.content ?? "",
      citations: (Array.isArray(row.citations) ? row.citations : []) as Citation[],
    }));
  }

  return (
    <ChatClient initialMessages={initialMessages} conversationId={conversationId} />
  );
}
