"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { WORKSPACE_CLIENTS } from "@/lib/workspace-clients";
import { useProjectTheme } from "./ProjectThemeProvider";

type Agent = "content" | "research" | "project_manager";

const AGENT_LABELS: Record<Agent, string> = {
  content: "Content",
  research: "Research",
  project_manager: "Project Manager",
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function SparkIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2c.3 3.6 1.1 6.2 2.4 7.6C15.8 10.9 18.4 11.7 22 12c-3.6.3-6.2 1.1-7.6 2.4C13.1 15.8 12.3 18.4 12 22c-.3-3.6-1.1-6.2-2.4-7.6C8.2 13.1 5.6 12.3 2 12c3.6-.3 6.2-1.1 7.6-2.4C10.9 8.2 11.7 5.6 12 2Z" />
    </svg>
  );
}

function CloseIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function AssistantBubble() {
  const { client: clientSlug } = useProjectTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [agent, setAgent] = useState<Agent>("content");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const clientIdRef = useRef<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function resolveClientId() {
      const { data } = await supabase
        .from("clients")
        .select("id")
        .eq("slug", clientSlug)
        .maybeSingle();
      if (!isActive) return;
      const nextClientId = data?.id ?? null;
      if (clientIdRef.current !== null && clientIdRef.current !== nextClientId) {
        setConversationId(null);
        setMessages([]);
      }
      clientIdRef.current = nextClientId;
      setClientId(nextClientId);
    }

    void resolveClientId();
    return () => {
      isActive = false;
    };
  }, [clientSlug]);

  useEffect(() => {
    if (!isOpen) return;
    let isActive = true;

    async function checkAvailability() {
      const response = await fetch("/api/team-hub/assistant");
      const body = await response.json().catch(() => ({}));
      if (!isActive || !response.ok) return;
      setUnavailable((body.monthlySpend ?? 0) >= (body.monthlyBudget ?? Infinity));
    }

    void checkAvailability();
    return () => {
      isActive = false;
    };
  }, [isOpen]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isSending || unavailable) return;

    setMessages((current) => [
      ...current,
      { id: `pending-${Date.now()}`, role: "user", content: text },
    ]);
    setDraft("");
    setIsSending(true);
    setError(null);

    try {
      const response = await fetch("/api/team-hub/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          agent,
          clientId: clientId ?? undefined,
          message: text,
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 402) {
          setUnavailable(true);
        } else {
          setError(body.error ?? "Could not reach the assistant.");
        }
        return;
      }

      setConversationId(body.conversationId);
      setMessages((current) => [
        ...current,
        { id: `${body.conversationId}-${Date.now()}`, role: "assistant", content: body.reply },
      ]);
    } catch {
      setError("Could not reach the assistant.");
    } finally {
      setIsSending(false);
    }
  }

  const clientName = WORKSPACE_CLIENTS[clientSlug]?.name ?? "";

  return (
    <>
      {isOpen && (
        <section
          role="dialog"
          aria-label="Claude assistant"
          className="fixed inset-x-4 bottom-24 z-50 flex max-h-[70vh] flex-col overflow-hidden rounded-[24px] border border-[#E3D8EA] bg-white shadow-[0_24px_60px_rgba(52,31,96,0.28)] sm:inset-x-auto sm:right-6 sm:w-[380px]"
        >
          <header className="flex items-center justify-between gap-3 border-b border-[#E9E0EF] px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8B7895]">
                Claude · {clientName}
              </p>
              <div className="mt-1.5 flex rounded-full border border-[#D7CBE0] p-0.5">
                {(Object.keys(AGENT_LABELS) as Agent[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAgent(option)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      agent === option
                        ? "bg-[#341F60] text-white"
                        : "text-[#5F3378] hover:bg-[#EEE3FA]"
                    }`}
                  >
                    {AGENT_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#5F3378] hover:bg-[#EEE3FA]"
            >
              <CloseIcon className="size-4" />
              <span className="sr-only">Close assistant</span>
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length ? (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <p
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13px] leading-5 ${
                      message.role === "user"
                        ? "bg-[#341F60] text-white"
                        : "bg-[#F5F0FA] text-[#28154F]"
                    }`}
                  >
                    {message.content}
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-[#D7CBE0] px-3.5 py-6 text-center text-xs text-[#8B7895]">
                Ask for a caption, a brief, or research on {clientName || "this client"}.
              </p>
            )}
            {isSending && (
              <div className="flex justify-start">
                <p className="rounded-2xl bg-[#F5F0FA] px-3.5 py-2 text-xs text-[#8B7895]">
                  Thinking…
                </p>
              </div>
            )}
            {unavailable && (
              <p
                role="alert"
                className="rounded-2xl border border-[#E5C760] bg-[#FFF4C7] px-3.5 py-2.5 text-xs text-[#725A00]"
              >
                The assistant has reached its usage limit for this month and
                will be available again next month.
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-2xl border border-[#E4B9B9] bg-[#FFF0F0] px-3.5 py-2.5 text-xs text-[#8B3E3E]"
              >
                {error}
              </p>
            )}
            <div ref={threadEndRef} />
          </div>

          <form
            onSubmit={sendMessage}
            className="flex items-end gap-2 border-t border-[#E9E0EF] p-3"
          >
            <textarea
              rows={1}
              value={draft}
              disabled={unavailable}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={unavailable ? "Unavailable this month" : "Ask Claude…"}
              className="flex-1 resize-none rounded-xl border border-[#CDBAD9] bg-white px-3 py-2 text-[13px] text-[#341F60] placeholder:text-[#AA98B4] focus:border-[#7D4698] focus:outline-none focus:ring-2 focus:ring-[#EEE3FA] disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isSending || unavailable || !draft.trim()}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#341F60] text-white transition hover:bg-[#28154F] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m5 12 14-7-7 14-2-5-5-2Z" />
              </svg>
              <span className="sr-only">Send</span>
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full text-white shadow-[0_10px_30px_rgba(217,119,87,0.45)] transition hover:scale-105"
        style={{
          background: "linear-gradient(145deg, #E8916B 0%, #D97757 60%, #BF5F41 100%)",
        }}
      >
        {isOpen ? <CloseIcon className="size-6" /> : <SparkIcon className="size-6" />}
        <span className="sr-only">
          {isOpen ? "Close Claude assistant" : "Open Claude assistant"}
        </span>
      </button>
    </>
  );
}
