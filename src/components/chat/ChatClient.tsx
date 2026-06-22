"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Textarea, Spinner, Card, cn } from "@/components/ui";
import { AiNotice } from "@/components/AiNotice";
import type { Citation } from "@/lib/types";

type ChatMessageView = {
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
};

type ChatClientProps = {
  initialMessages: { role: "user" | "assistant"; content: string; citations: Citation[] }[];
  conversationId: string | null;
};

const EXAMPLE_PROMPTS = [
  "Show the most hostile emails",
  "Anything about my age?",
  "Find threats from my manager",
];

const CITATION_RE = /\[#([0-9a-fA-F-]{8,})\]/g;

function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * Render a single line of simple markdown supporting **bold** and inline
 * citation chips of the form [#<uuid>].
 */
function renderInline(
  text: string,
  citations: Citation[],
  keyPrefix: string,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let idx = 0;

  // First split on citation tokens, then handle bold within each plain segment.
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  CITATION_RE.lastIndex = 0;

  const pushPlain = (chunk: string) => {
    if (!chunk) return;
    const boldParts = chunk.split(/(\*\*[^*]+\*\*)/g);
    for (const part of boldParts) {
      if (!part) continue;
      if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
        nodes.push(
          <strong key={`${keyPrefix}-b-${idx++}`} className="font-semibold">
            {part.slice(2, -2)}
          </strong>,
        );
      } else {
        nodes.push(<span key={`${keyPrefix}-t-${idx++}`}>{part}</span>);
      }
    }
  };

  while ((match = CITATION_RE.exec(text)) !== null) {
    pushPlain(text.slice(lastIndex, match.index));
    const emailId = match[1];
    const cite = citations.find((c) => c.email_id === emailId);
    const label = cite?.subject?.trim() ? cite.subject.trim() : `#${shortId(emailId)}`;
    nodes.push(
      <Link
        key={`${keyPrefix}-c-${idx++}`}
        href={`/dashboard?email=${emailId}`}
        className="mx-0.5 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 align-baseline text-xs font-medium text-blue-700 hover:bg-blue-100"
        title={cite?.subject ?? `Email ${emailId}`}
      >
        <span aria-hidden>#</span>
        <span className="max-w-[14rem] truncate">{label}</span>
      </Link>,
    );
    lastIndex = match.index + match[0].length;
  }
  pushPlain(text.slice(lastIndex));

  return nodes;
}

function AssistantContent({
  content,
  citations,
}: {
  content: string;
  citations: Citation[];
}) {
  const blocks: React.ReactNode[] = [];
  const lines = content.split("\n");

  let listBuffer: string[] = [];
  let blockIdx = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const items = listBuffer;
    listBuffer = [];
    blocks.push(
      <ul key={`ul-${blockIdx++}`} className="my-2 list-disc space-y-1 pl-5">
        {items.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed text-gray-800">
            {renderInline(item, citations, `li-${blockIdx}-${i}`)}
          </li>
        ))}
      </ul>,
    );
  };

  let paragraphBuffer: string[] = [];
  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join(" ");
    paragraphBuffer = [];
    blocks.push(
      <p key={`p-${blockIdx++}`} className="my-2 text-sm leading-relaxed text-gray-800">
        {renderInline(text, citations, `p-${blockIdx}`)}
      </p>,
    );
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trim().startsWith("- ")) {
      flushParagraph();
      listBuffer.push(line.trim().slice(2));
    } else if (line.trim() === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraphBuffer.push(line.trim());
    }
  }
  flushParagraph();
  flushList();

  return <div>{blocks}</div>;
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Assistant is typing">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
    </span>
  );
}

export default function ChatClient({ initialMessages, conversationId }: ChatClientProps) {
  const [messages, setMessages] = useState<ChatMessageView[]>(
    initialMessages.map((m) => ({
      role: m.role,
      content: m.content,
      citations: m.citations ?? [],
    })),
  );
  const [convId, setConvId] = useState<string | null>(conversationId);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streaming]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;

      setError(null);
      setInput("");
      setStreaming(true);

      const userMsg: ChatMessageView = { role: "user", content: trimmed, citations: [] };
      // Add user message + empty assistant placeholder.
      setMessages((prev) => [
        ...prev,
        userMsg,
        { role: "assistant", content: "", citations: [] },
      ]);

      const assistantIndexRef = { current: -1 };
      setMessages((prev) => {
        assistantIndexRef.current = prev.length - 1;
        return prev;
      });

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, conversationId: convId }),
        });

        if (!res.ok || !res.body) {
          let msg = "Something went wrong. Please try again.";
          try {
            const data = await res.json();
            if (data?.error) msg = data.error;
          } catch {
            // ignore
          }
          throw new Error(msg);
        }

        const headerConvId = res.headers.get("x-conversation-id");
        if (headerConvId) {
          setConvId(headerConvId);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let citationsParsed: Citation[] = [];

        const MARKER = "\n\n[[CITATIONS]]";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const markerPos = buffer.indexOf(MARKER);
          let visible = buffer;
          if (markerPos !== -1) {
            visible = buffer.slice(0, markerPos);
          }

          setMessages((prev) => {
            const next = [...prev];
            const lastIdx = next.length - 1;
            if (lastIdx >= 0 && next[lastIdx].role === "assistant") {
              next[lastIdx] = { ...next[lastIdx], content: visible };
            }
            return next;
          });
        }

        buffer += decoder.decode();

        const markerPos = buffer.indexOf(MARKER);
        let finalContent = buffer;
        if (markerPos !== -1) {
          finalContent = buffer.slice(0, markerPos);
          const jsonPart = buffer.slice(markerPos + MARKER.length).trim();
          if (jsonPart) {
            try {
              const parsed = JSON.parse(jsonPart);
              if (Array.isArray(parsed)) {
                citationsParsed = parsed as Citation[];
              }
            } catch {
              // ignore malformed trailer
            }
          }
        }

        setMessages((prev) => {
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (lastIdx >= 0 && next[lastIdx].role === "assistant") {
            next[lastIdx] = {
              ...next[lastIdx],
              content: finalContent,
              citations: citationsParsed,
            };
          }
          return next;
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Something went wrong. Please try again.";
        setError(message);
        // Remove the empty assistant placeholder if it never received content.
        setMessages((prev) => {
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (lastIdx >= 0 && next[lastIdx].role === "assistant" && !next[lastIdx].content) {
            next.pop();
          }
          return next;
        });
      } finally {
        setStreaming(false);
      }
    },
    [convId, streaming],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-gray-200 px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900">Chat</h1>
        <p className="mt-0.5 text-xs text-gray-500">
          Answers cite your original emails. AI category and severity labels are interpretations,
          not legal conclusions.
        </p>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {isEmpty ? (
            <div className="mt-6 flex flex-col items-center gap-6 text-center">
              <div className="max-w-md">
                <h2 className="text-base font-medium text-gray-900">
                  Ask about your inbox
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Ask questions in plain language. Answers reference the original messages so you
                  can verify everything yourself.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-gray-400 hover:bg-gray-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <AiNotice className="max-w-md" />
            </div>
          ) : (
            messages.map((msg, i) => {
              const isUser = msg.role === "user";
              const isLast = i === messages.length - 1;
              const showTyping = isLast && msg.role === "assistant" && streaming && !msg.content;
              return (
                <div
                  key={i}
                  className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
                >
                  {isUser ? (
                    <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-blue-600 px-4 py-2 text-sm leading-relaxed text-white">
                      {msg.content}
                    </div>
                  ) : (
                    <Card className="max-w-[85%] px-4 py-3">
                      {showTyping ? (
                        <TypingDots />
                      ) : (
                        <AssistantContent content={msg.content} citations={msg.citations} />
                      )}
                    </Card>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="border-t border-gray-200 px-4 py-3">
        <div className="mx-auto max-w-3xl">
          {error ? (
            <p className="mb-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about your emails..."
              rows={2}
              disabled={streaming}
              className="flex-1 resize-none"
            />
            <Button
              type="button"
              onClick={() => void send(input)}
              disabled={streaming || !input.trim()}
            >
              {streaming ? <Spinner /> : "Send"}
            </Button>
          </div>
          {!isEmpty ? (
            <p className="mt-2 text-xs text-gray-400">
              Press Enter to send, Shift+Enter for a new line.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
