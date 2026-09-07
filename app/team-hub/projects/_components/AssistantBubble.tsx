"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useProjectTheme } from "./ProjectThemeProvider";

type Agent = "content" | "research" | "project_manager";
type Source = { title: string; url: string };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; sources?: Source[] };
type ThreadState = { conversationId: string | null; messages: ChatMessage[] };
type MemoryCategory = "brand_voice" | "audience" | "content_style" | "winning_idea" | "avoid" | "fact";
type MemoryItem = { id: string; category: MemoryCategory; content: string; created_by: string; created_at: string };

const AGENTS: Record<Agent, {
  label: string; shortLabel: string; provider: string; intro: string;
  placeholder: string; prompts: string[]; color: string; pale: string; icon: string;
}> = {
  content: {
    label: "Content Specialist", shortLabel: "Content", provider: "ChatGPT",
    intro: "Ideas, hooks and captions that remember the brand.",
    placeholder: "Ask for a caption or a fresh idea…",
    prompts: ["Give me 3 campaign angles", "Write an Instagram caption", "Turn this into a stronger hook"],
    color: "#D86F50", pale: "#FFF0E9", icon: "✦",
  },
  research: {
    label: "Researcher", shortLabel: "Research", provider: "Perplexity",
    intro: "Current, source-backed research for smarter strategy.",
    placeholder: "What should we research?",
    prompts: ["Research this week's industry trends", "Find competitor content gaps", "Fact-check this claim"],
    color: "#19766D", pale: "#E7F5F1", icon: "⌕",
  },
  project_manager: {
    label: "Project Manager", shortLabel: "Projects", provider: "Claude",
    intro: "Live project status, priorities and team updates.",
    placeholder: "Ask about projects or next steps…",
    prompts: ["What needs attention today?", "Show blocked client work", "Draft a team status update"],
    color: "#66408A", pale: "#F1EAF7", icon: "✓",
  },
};

const MEMORY_LABELS: Record<MemoryCategory, string> = {
  brand_voice: "Brand voice", audience: "Audience", content_style: "Content style",
  winning_idea: "What worked", avoid: "Avoid", fact: "Brand fact",
};

function freshThreads(): Record<Agent, ThreadState> {
  return {
    content: { conversationId: null, messages: [] },
    research: { conversationId: null, messages: [] },
    project_manager: { conversationId: null, messages: [] },
  };
}

function CloseIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function MemoryPanel({ clientId, clientName, onClose }: { clientId: string; clientName: string; onClose: () => void }) {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [category, setCategory] = useState<MemoryCategory>("brand_voice");
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setIsLoading(true);
      const response = await fetch(`/api/team-hub/assistant/memory?clientId=${encodeURIComponent(clientId)}`);
      const body = await response.json().catch(() => ({}));
      if (!active) return;
      if (response.ok) setItems(body.memories ?? []);
      else setError(body.error ?? "Could not load brand memory.");
      setIsLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [clientId]);

  async function addMemory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || isSaving) return;
    setIsSaving(true);
    setError(null);
    const response = await fetch("/api/team-hub/assistant/memory", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, category, content }),
    });
    const body = await response.json().catch(() => ({}));
    setIsSaving(false);
    if (!response.ok) { setError(body.error ?? "Could not save memory."); return; }
    setItems((current) => [body.memory, ...current]);
    setDraft("");
  }

  async function removeMemory(id: string) {
    setError(null);
    const response = await fetch("/api/team-hub/assistant/memory", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not delete memory.");
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#FFFCF9]">
      <header className="flex items-center justify-between border-b border-[#EADFD8] px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#A06E5D]">Content memory</p>
          <h3 className="mt-0.5 text-base font-semibold text-[#321D45]">What we know about {clientName}</h3>
        </div>
        <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full text-[#684F73] hover:bg-[#F2E9E4]" aria-label="Close memory">
          <CloseIcon className="size-4" />
        </button>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <p className="py-8 text-center text-xs text-[#8E7D91]">Loading memory…</p>
        ) : items.length ? items.map((item) => (
          <article key={item.id} className="group rounded-2xl border border-[#E8DDD7] bg-white px-3.5 py-3 shadow-[0_4px_16px_rgba(66,39,76,0.04)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="rounded-full bg-[#FFF0E9] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#B65438]">{MEMORY_LABELS[item.category]}</span>
                <p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-[#4B3B50]">{item.content}</p>
              </div>
              <button type="button" onClick={() => void removeMemory(item.id)} className="shrink-0 rounded-full px-2 py-1 text-[10px] text-[#A88F98] opacity-60 hover:bg-[#FFF0F0] hover:text-[#A24343] group-hover:opacity-100" aria-label="Delete memory">Delete</button>
            </div>
          </article>
        )) : (
          <div className="rounded-2xl border border-dashed border-[#DCCEC6] bg-white/70 px-5 py-8 text-center">
            <p className="text-sm font-semibold text-[#503A5B]">No extra memories yet</p>
            <p className="mt-1 text-xs leading-5 text-[#8E7D91]">Add tone preferences, winning ideas, phrases to avoid, or useful brand facts.</p>
          </div>
        )}
      </div>
      <form onSubmit={addMemory} className="border-t border-[#EADFD8] bg-white p-3">
        <div className="flex gap-2">
          <select value={category} onChange={(event) => setCategory(event.target.value as MemoryCategory)} className="rounded-xl border border-[#DCCEC6] bg-[#FFFCF9] px-2.5 text-[11px] font-semibold text-[#5D4765] outline-none focus:border-[#D86F50]">
            {(Object.keys(MEMORY_LABELS) as MemoryCategory[]).map((option) => <option key={option} value={option}>{MEMORY_LABELS[option]}</option>)}
          </select>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={1000} placeholder="Add something worth remembering…" className="min-w-0 flex-1 rounded-xl border border-[#DCCEC6] px-3 py-2.5 text-xs text-[#3D2B46] outline-none placeholder:text-[#B1A2AC] focus:border-[#D86F50] focus:ring-2 focus:ring-[#FFF0E9]" />
          <button type="submit" disabled={isSaving || !draft.trim()} className="rounded-xl bg-[#341F60] px-3 text-xs font-semibold text-white disabled:opacity-40">Save</button>
        </div>
        {error && <p role="alert" className="mt-2 text-[11px] text-[#9B3F3F]">{error}</p>}
      </form>
    </div>
  );
}

export function AssistantBubble() {
  const { client: clientSlug } = useProjectTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [agent, setAgent] = useState<Agent>("content");
  const [threads, setThreads] = useState<Record<Agent, ThreadState>>(freshThreads);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [providerAvailability, setProviderAvailability] = useState<Record<Agent, boolean> | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const clientIdRef = useRef<string | null>(null);
  const activeThread = threads[agent];
  const agentDetails = AGENTS[agent];
  const providerReady = providerAvailability?.[agent] ?? true;

  useEffect(() => {
    let isActive = true;
    async function resolveClientId() {
      const { data } = await supabase.from("clients").select("id, name").eq("slug", clientSlug).maybeSingle();
      if (!isActive) return;
      const nextClientId = data?.id ?? null;
      if (clientIdRef.current !== null && clientIdRef.current !== nextClientId) {
        setThreads(freshThreads());
        setMemoryOpen(false);
      }
      clientIdRef.current = nextClientId;
      setClientId(nextClientId);
      setClientName(data?.name ?? clientSlug);
    }
    void resolveClientId();
    return () => { isActive = false; };
  }, [clientSlug]);

  useEffect(() => {
    if (!isOpen) return;
    let isActive = true;
    async function checkAvailability() {
      const response = await fetch("/api/team-hub/assistant");
      const body = await response.json().catch(() => ({}));
      if (!isActive || !response.ok) return;
      setUnavailable((body.monthlySpend ?? 0) >= (body.monthlyBudget ?? Infinity));
      setProviderAvailability(body.providers ?? null);
    }
    void checkAvailability();
    return () => { isActive = false; };
  }, [isOpen]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeThread.messages, isSending]);

  function chooseAgent(nextAgent: Agent) {
    setAgent(nextAgent); setDraft(""); setError(null); setMemoryOpen(false);
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isSending || unavailable || !providerReady) return;
    const pendingMessage: ChatMessage = { id: `pending-${Date.now()}`, role: "user", content: text };
    setThreads((current) => ({ ...current, [agent]: { ...current[agent], messages: [...current[agent].messages, pendingMessage] } }));
    setDraft(""); setIsSending(true); setError(null);
    try {
      const response = await fetch("/api/team-hub/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeThread.conversationId, agent, clientId: clientId ?? undefined, message: text }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 402) setUnavailable(true);
        else setError(body.error ?? `Could not reach ${agentDetails.provider}.`);
        return;
      }
      setThreads((current) => ({
        ...current,
        [agent]: {
          conversationId: body.conversationId,
          messages: [...current[agent].messages, {
            id: `${body.conversationId}-${Date.now()}`, role: "assistant",
            content: body.reply, sources: body.sources ?? [],
          }],
        },
      }));
    } catch {
      setError(`Could not reach ${agentDetails.provider}.`);
    } finally { setIsSending(false); }
  }

  return (
    <>
      {isOpen && (
        <section role="dialog" aria-label="Understory AI team" className="fixed inset-x-3 bottom-28 z-50 flex h-[min(720px,calc(100vh-9rem))] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-[#FFFCF9] shadow-[0_28px_90px_rgba(48,27,62,0.28),0_6px_20px_rgba(48,27,62,0.12)] sm:inset-x-auto sm:right-6 sm:w-[430px]">
          {memoryOpen && clientId && <MemoryPanel clientId={clientId} clientName={clientName || "this client"} onClose={() => setMemoryOpen(false)} />}
          <header className="relative overflow-hidden bg-[#321D45] px-4 pb-4 pt-3.5 text-white">
            <div className="absolute -right-10 -top-16 size-40 rounded-full bg-[#E8916B]/20 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <div className="relative size-12 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#FFE9DC] to-[#D9C4E8] ring-1 ring-white/30">
                <Image src="/ai-content-specialist.png" alt="Understory content specialist" fill sizes="48px" className="object-cover object-top" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em]">Understory AI team</h2>
                  <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-semibold text-white/80"><span className="size-1.5 rounded-full bg-[#72D6A0]" /> Live</span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-white/60">Working on {clientName || clientSlug}</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white" aria-label="Close AI team"><CloseIcon className="size-4" /></button>
            </div>
            <nav className="relative mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-black/15 p-1" aria-label="AI roles">
              {(Object.keys(AGENTS) as Agent[]).map((option) => {
                const details = AGENTS[option]; const selected = agent === option;
                return (
                  <button key={option} type="button" onClick={() => chooseAgent(option)} aria-pressed={selected} className={`rounded-xl px-2 py-2 text-left transition ${selected ? "bg-white text-[#321D45] shadow-sm" : "text-white/65 hover:bg-white/10 hover:text-white"}`}>
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold"><span style={{ color: selected ? details.color : undefined }}>{details.icon}</span>{details.shortLabel}</span>
                    <span className={`mt-0.5 block text-[8px] font-bold uppercase tracking-[0.12em] ${selected ? "text-[#9B879F]" : "text-white/35"}`}>{details.provider}</span>
                  </button>
                );
              })}
            </nav>
          </header>
          <div className="flex items-center justify-between border-b border-[#EEE5DF] bg-white px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl text-sm font-bold" style={{ color: agentDetails.color, backgroundColor: agentDetails.pale }}>{agentDetails.icon}</span>
              <div className="min-w-0"><p className="truncate text-xs font-semibold text-[#402C49]">{agentDetails.label}</p><p className="truncate text-[10px] text-[#938396]">Powered by {agentDetails.provider}</p></div>
            </div>
            {agent === "content" && clientId && <button type="button" onClick={() => setMemoryOpen(true)} className="flex items-center gap-1.5 rounded-full border border-[#E6D8D1] bg-[#FFF9F5] px-3 py-1.5 text-[10px] font-semibold text-[#9D4E37] hover:border-[#DFAF9E] hover:bg-[#FFF0E9]"><span aria-hidden="true">◉</span> Brand memory</button>}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto bg-[radial-gradient(circle_at_top,#FFF7F0_0,transparent_42%)] px-4 py-4">
            {!activeThread.messages.length && (
              <div className="flex min-h-full flex-col justify-center pb-8">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl text-xl shadow-sm" style={{ color: agentDetails.color, backgroundColor: agentDetails.pale }}>{agentDetails.icon}</div>
                <h3 className="mt-3 text-center text-sm font-semibold text-[#3E2B47]">Meet your {agentDetails.label}</h3>
                <p className="mx-auto mt-1 max-w-[290px] text-center text-[11px] leading-5 text-[#8F8092]">{agentDetails.intro}</p>
                <div className="mt-5 space-y-2">
                  {agentDetails.prompts.map((prompt) => <button key={prompt} type="button" onClick={() => setDraft(prompt)} className="flex w-full items-center justify-between rounded-2xl border border-[#EAE0DA] bg-white/90 px-3.5 py-2.5 text-left text-[11px] font-medium text-[#5C4862] shadow-[0_3px_12px_rgba(67,42,72,0.04)] hover:border-[#D9C7BD] hover:bg-white">{prompt}<span className="text-[#B8A6B9]">→</span></button>)}
                </div>
              </div>
            )}
            {activeThread.messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] px-3.5 py-2.5 ${message.role === "user" ? "rounded-[20px_20px_5px_20px] bg-[#321D45] text-white" : "rounded-[20px_20px_20px_5px] border border-[#E9E0DA] bg-white text-[#413348] shadow-[0_5px_18px_rgba(60,38,67,0.05)]"}`}>
                  <p className="whitespace-pre-wrap text-[12px] leading-[1.65]">{message.content}</p>
                  {!!message.sources?.length && <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#EEE7E2] pt-2.5">{message.sources.map((source, index) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="max-w-full truncate rounded-full bg-[#E7F5F1] px-2.5 py-1 text-[9px] font-semibold text-[#17685F] hover:bg-[#D5EDE7]">{index + 1}. {source.title}</a>)}</div>}
                </div>
              </div>
            ))}
            {isSending && <div className="flex justify-start"><div className="flex items-center gap-1.5 rounded-[18px_18px_18px_5px] border border-[#E9E0DA] bg-white px-4 py-3 shadow-sm">{[0, 1, 2].map((dot) => <span key={dot} className="size-1.5 animate-pulse rounded-full" style={{ backgroundColor: agentDetails.color, animationDelay: `${dot * 160}ms` }} />)}</div></div>}
            <div ref={threadEndRef} />
          </div>
          {(unavailable || !providerReady || error) && <div className={`mx-3 mt-2 rounded-xl border px-3 py-2 text-[10px] ${unavailable ? "border-[#E5C760] bg-[#FFF4C7] text-[#725A00]" : "border-[#E7CACA] bg-[#FFF3F1] text-[#8B3E3E]"}`} role="alert">
            {unavailable ? "The shared monthly AI budget has been reached." : !providerReady ? `${agentDetails.provider} needs its API key added to the deployment environment.` : error}
          </div>}
          <form onSubmit={sendMessage} className="border-t border-[#EEE5DF] bg-white p-3">
            <div className="flex items-end gap-2 rounded-2xl border border-[#DED1D9] bg-[#FFFCFA] p-1.5 shadow-inner focus-within:border-[#B996C5] focus-within:ring-2 focus-within:ring-[#F1EAF7]">
              <textarea rows={1} value={draft} disabled={unavailable || !providerReady} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={!providerReady ? `${agentDetails.provider} setup required` : agentDetails.placeholder} className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-[12px] leading-5 text-[#3E2D45] outline-none placeholder:text-[#AD9EAE] disabled:cursor-not-allowed" />
              <button type="submit" disabled={isSending || unavailable || !providerReady || !draft.trim()} className="grid size-9 shrink-0 place-items-center rounded-xl text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-35" style={{ backgroundColor: agentDetails.color }}>
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 14-7-7 14-2-5-5-2Z" /></svg><span className="sr-only">Send to {agentDetails.label}</span>
              </button>
            </div>
            <p className="mt-1.5 text-center text-[8px] tracking-[0.04em] text-[#B0A3B1]">{agentDetails.provider} may make mistakes — review before publishing.</p>
          </form>
        </section>
      )}
      <div className="fixed bottom-5 right-5 z-50 flex items-end gap-2">
        {!isOpen && <div className="mb-2 hidden rounded-2xl rounded-br-sm border border-[#E9DED7] bg-white/95 px-3 py-2 shadow-[0_8px_30px_rgba(54,31,66,0.13)] backdrop-blur sm:block"><p className="text-[10px] font-semibold text-[#4B3554]">Need a content idea?</p><p className="mt-0.5 text-[9px] text-[#9A899D]">Your AI team is ready.</p></div>}
        <button type="button" onClick={() => setIsOpen((current) => !current)} aria-expanded={isOpen} className="group relative grid size-[76px] place-items-center rounded-[26px] bg-gradient-to-br from-[#FFE7D9] via-[#F2DDE2] to-[#DCCCEB] shadow-[0_14px_36px_rgba(92,47,85,0.3)] ring-2 ring-white transition hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(92,47,85,0.35)]">
          {isOpen ? <span className="grid size-10 place-items-center rounded-full bg-[#321D45] text-white"><CloseIcon className="size-5" /></span> : <Image src="/ai-content-specialist.png" alt="Open Understory AI team" fill sizes="76px" className="rounded-[24px] object-cover object-top transition-transform group-hover:scale-105" priority />}
          {!isOpen && <span className="absolute -right-1 -top-1 size-4 rounded-full border-[3px] border-white bg-[#59BF87]" aria-label="Available" />}
          <span className="sr-only">{isOpen ? "Close Understory AI team" : "Open Understory AI team"}</span>
        </button>
      </div>
    </>
  );
}
