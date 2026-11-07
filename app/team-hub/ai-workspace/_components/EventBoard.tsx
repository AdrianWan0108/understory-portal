"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Item = { id: string; plan_id: string; title: string; phase: string; kind: string; owner: string | null; due_date: string | null; status: string; blocker: string | null; waiting_on: string | null; notes: string | null; sort_order: number; completed_at: string | null };
type Plan = { id: string; client_id: string | null; title: string; start_date: string; end_date: string; timezone: string; status: string; notes: string | null };
type BriefItem = { item_id: string | null; title: string; due_date: string | null; owner: string | null; note: string | null };
type Brief = { headline: string; summary: string; as_of: string; suggestions: string[]; blockers: BriefItem[] };
type Summary = { today: string; days_to_start: number; stage: "before" | "live" | "after"; progress: { done: number; total: number; percent: number };
  phases: Array<{ phase: string; done: number; total: number }>; blocked: Item[]; waiting: Item[]; overdue: Item[]; due_soon: Item[]; my_todos: Item[]; next_up: Item[] };
type Board = { plan: Plan; items: Item[]; summary: Summary; latest_brief: { task_id: string; completed_at: string | null; brief: Brief } | null };
type Api = <T>(path: string, init?: RequestInit) => Promise<T>;

const STATUS: Record<string, { label: string; className: string }> = {
  todo: { label: "未做", className: "border-[#D9CEE3] bg-white text-[#5D3A75]" },
  in_progress: { label: "做緊", className: "border-[#B9D4F2] bg-[#EEF5FD] text-[#24548A]" },
  waiting: { label: "等緊人", className: "border-[#EBD08C] bg-[#FFF7E0] text-[#6B4E0E]" },
  blocked: { label: "卡住", className: "border-[#E8B4B4] bg-[#FFEFEF] text-[#8B2F2F]" },
  done: { label: "完成", className: "border-[#B8DCC2] bg-[#EFF8F1] text-[#286B3D]" },
  skipped: { label: "唔做", className: "border-[#DDD] bg-[#F5F5F5] text-[#777]" },
};
const STATUS_KEYS = Object.keys(STATUS);
const KINDS: Record<string, string> = { task: "工作", decision: "要決定", reminder: "提醒", milestone: "活動日" };

const inputClass = "w-full rounded-lg border border-[#CDBDD8] bg-white px-3 py-2 text-sm text-[#2F1D43] focus:border-[#6B4882] focus:outline-none focus:ring-2 focus:ring-[#E9DCF1]";
const buttonClass = "rounded-lg bg-[#432560] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#32194C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698] disabled:opacity-50";
const subtleButton = "rounded-lg border border-[#CDBDD8] px-3 py-1.5 text-sm font-semibold text-[#58396D] hover:bg-[#F2EAF6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698] disabled:opacity-50";

const shortDate = (value: string | null) => value ? `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}` : "冇期限";
const weekday = (value: string) => ["日", "一", "二", "三", "四", "五", "六"][new Date(`${value}T12:00:00Z`).getUTCDay()];

function countdown(summary: Summary) {
  if (summary.stage === "live") return { value: "進行中", note: "活動週" };
  if (summary.stage === "after") return { value: "完咗", note: "記得 follow up" };
  if (summary.days_to_start === 0) return { value: "今日", note: "開始" };
  return { value: String(summary.days_to_start), note: "日後開始" };
}

function Card({ title, tone, count, children }: { title: string; tone: "red" | "amber" | "blue" | "purple"; count?: number; children: React.ReactNode }) {
  const tones = { red: "border-[#EBC4C4] bg-[#FFF8F8]", amber: "border-[#EEDCA8] bg-[#FFFBF0]", blue: "border-[#C9DAF0] bg-[#F7FAFE]", purple: "border-[#DED2E5] bg-[#FFFDFB]" };
  return <section className={`rounded-2xl border p-4 ${tones[tone]}`}><h3 className="mb-3 flex items-center justify-between text-sm font-semibold text-[#321D4B]">{title}{count !== undefined && <span className="rounded-full bg-white px-2 py-0.5 text-xs text-[#5D3A75]">{count}</span>}</h3>{children}</section>;
}

function ItemLine({ item, show }: { item: Item; show?: "blocker" | "waiting" }) {
  const extra = show === "blocker" ? item.blocker : show === "waiting" ? item.waiting_on && `等緊：${item.waiting_on}` : null;
  return <li className="border-b border-black/5 py-2 last:border-0"><p className="text-sm font-medium text-[#2F1D43]">{item.title}</p>
    <p className="mt-0.5 text-xs text-[#766682]">{[shortDate(item.due_date), item.owner].filter(Boolean).join(" · ")}{extra ? ` · ${extra}` : ""}</p></li>;
}

function List({ items, empty, show }: { items: Item[]; empty: string; show?: "blocker" | "waiting" }) {
  return items.length ? <ul>{items.map((item) => <ItemLine key={item.id} item={item} show={show} />)}</ul> : <p className="text-sm text-[#8A7A95]">{empty}</p>;
}

export function EventBoard({ api }: { api: Api }) {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [me, setMe] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Item>>({});
  const [adding, setAdding] = useState<Record<string, Partial<Item>>>({});
  const askKey = useRef<Record<string, string>>({});

  async function load() {
    try {
      const result = await api<{ boards: Board[]; me: string }>("/api/ai/events");
      setBoards(result.boards); setMe(result.me); setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load event plans."); }
  }
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 60_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function update(item: Item, patch: Partial<Item>) {
    setBusy(item.id);
    try { await api(`/api/ai/events/items/${item.id}`, { method: "PATCH", body: JSON.stringify(patch) }); await load(); setEditing(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save."); }
    setBusy(null);
  }

  async function add(plan: Plan, defaultPhase: string) {
    const value = adding[plan.id] ?? {};
    if (!value.title?.trim()) return;
    setBusy(`add-${plan.id}`);
    try {
      await api("/api/ai/events/items", { method: "POST", body: JSON.stringify({ plan_id: plan.id, title: value.title, phase: value.phase || defaultPhase,
        kind: value.kind || "task", owner: value.owner || null, due_date: value.due_date || null, status: value.status || "todo", blocker: value.blocker || null }) });
      setAdding({ ...adding, [plan.id]: {} }); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not add."); }
    setBusy(null);
  }

  async function askPlanner(plan: Plan) {
    askKey.current[plan.id] ??= crypto.randomUUID();
    setBusy(`ask-${plan.id}`);
    try {
      const result = await api<{ task: { portal_deep_link: string; status: string } }>("/api/ai/tasks", { method: "POST", body: JSON.stringify({
        agent: "events", title: `Event check: ${plan.title}`.slice(0, 200), priority: "normal", client_id: plan.client_id,
        objective: "Check this event plan: progress, blockers, overdue items, what is due in the next 3 days and my to-dos. Write a short brief with suggestions. Do not contact anyone.",
        input_payload: { plan_id: plan.id }, idempotency_key: `event-check:${askKey.current[plan.id]}` }) });
      delete askKey.current[plan.id];
      setNotice(result.task.status === "failed" ? "Event Planner could not be reached. Retry from the task page." : "Event Planner is checking the plan. The brief appears here when it is done.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start a check."); }
    setBusy(null);
  }

  if (error && !boards) return <p role="alert" className="rounded-lg border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]">{error} <button className="ml-2 underline" onClick={() => void load()}>Retry</button></p>;
  if (!boards) return <div className="rounded-xl border border-dashed border-[#CDBDD8] bg-white/70 px-5 py-8 text-sm text-[#766682]">Loading event plans…</div>;
  if (!boards.length) return <div className="rounded-xl border border-dashed border-[#CDBDD8] bg-white/70 px-5 py-8 text-sm text-[#766682]">No event plans in planning or live status.</div>;

  return <div className="space-y-8">
    {error && <p role="alert" className="rounded-lg border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-[#BFD8C4] bg-[#F0F8F1] px-4 py-3 text-sm text-[#2E6A40]">{notice}</p>}
    {boards.map(({ plan, items, summary, latest_brief: latest }) => {
      const count = countdown(summary);
      const phases = [...new Set(items.map((item) => item.phase))];
      const newItem = adding[plan.id] ?? {};
      return <article key={plan.id} className="space-y-4">
        <section className="rounded-2xl border border-[#DED2E5] bg-[#FFFDFB] p-5 shadow-[0_3px_14px_rgba(42,22,69,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8A5DA3]">Event plan</p>
              <h2 className="mt-1 text-2xl font-semibold text-[#301A49]">{plan.title}</h2>
              <p className="mt-1 text-sm text-[#766682]">{shortDate(plan.start_date)}（{weekday(plan.start_date)}）至 {shortDate(plan.end_date)}（{weekday(plan.end_date)}）· 今日 {shortDate(summary.today)}</p></div>
            <div className="text-right"><p className="text-4xl font-semibold tabular-nums text-[#432560]">{count.value}</p><p className="text-xs text-[#766682]">{count.note}</p></div>
          </div>
          <div className="mt-4"><div className="flex justify-between text-xs font-semibold text-[#59426B]"><span>整體進度</span><span>{summary.progress.done}/{summary.progress.total} · {summary.progress.percent}%</span></div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[#EEE6F3]" role="progressbar" aria-valuenow={summary.progress.percent} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-[#5B3576]" style={{ width: `${summary.progress.percent}%` }} /></div></div>
          <div className="mt-3 flex flex-wrap gap-1.5">{summary.phases.map((phase) => <span key={phase.phase} className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${phase.done === phase.total ? "border-[#B8DCC2] bg-[#EFF8F1] text-[#286B3D]" : "border-[#D9CEE3] bg-[#F7F2FA] text-[#5D3A75]"}`}>{phase.phase} {phase.done}/{phase.total}</span>)}</div>
        </section>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card title="🔴 卡住 (Blockers)" tone="red" count={summary.blocked.length}><List items={summary.blocked} empty="冇嘢卡住。" show="blocker" /></Card>
          <Card title="⏳ 等緊人回覆" tone="amber" count={summary.waiting.length}><List items={summary.waiting} empty="冇等緊人。" show="waiting" /></Card>
          <Card title="⏰ 提醒：過期 + 3 日內到期" tone="blue" count={summary.overdue.length + summary.due_soon.length}>
            {summary.overdue.length > 0 && <><p className="text-xs font-semibold text-[#8B2F2F]">已過期</p><List items={summary.overdue} empty="" /></>}
            {summary.due_soon.length > 0 && <><p className="mt-2 text-xs font-semibold text-[#24548A]">就快到期</p><List items={summary.due_soon} empty="" /></>}
            {!summary.overdue.length && !summary.due_soon.length && <p className="text-sm text-[#8A7A95]">3 日內冇嘢到期。</p>}
          </Card>
          <Card title={`👤 你要做（${me.split(/\s+/)[0] || "你"}）`} tone="purple" count={summary.my_todos.length}><List items={summary.my_todos} empty="冇寫明你負責嘅嘢。" /></Card>
        </div>

        <section className="rounded-2xl border border-[#DED2E5] bg-[#FFFDFB] p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold text-[#321D4B]">Event Planner 報告</h3>
            <button className={buttonClass} disabled={busy === `ask-${plan.id}`} onClick={() => void askPlanner(plan)}>{busy === `ask-${plan.id}` ? "Starting…" : "叫 Event Planner 而家 check"}</button></div>
          {latest ? <div className="space-y-2 text-sm text-[#3B2A4C]"><p className="font-semibold">{latest.brief.headline}</p><p className="whitespace-pre-line">{latest.brief.summary}</p>
            {latest.brief.suggestions.length > 0 && <ul className="list-disc space-y-1 pl-5">{latest.brief.suggestions.map((text) => <li key={text}>{text}</li>)}</ul>}
            <p className="text-xs text-[#8A7A95]">{latest.brief.as_of} · <Link className="underline" href={`/team-hub/ai-workspace/tasks/${latest.task_id}`}>Open task</Link></p></div>
            : <p className="text-sm text-[#8A7A95]">未有報告。Event Planner 每朝 9 點會自動 check 一次，亦可以撳上面個掣即刻 check。</p>}
        </section>

        <section className="rounded-2xl border border-[#DED2E5] bg-[#FFFDFB] p-5">
          <h3 className="mb-3 text-lg font-semibold text-[#321D4B]">全部 timeline</h3>
          <div className="space-y-5">{phases.map((phase) => <div key={phase}><h4 className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[#8A5DA3]">{phase}</h4>
            <ul className="divide-y divide-[#EEE7F1]">{items.filter((item) => item.phase === phase).map((item) => <li key={item.id} className="py-2.5">
              {editing === item.id ? <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr]">
                <input aria-label="Title" className={inputClass} value={draft.title ?? ""} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
                <input aria-label="Owner" placeholder="負責人" className={inputClass} value={draft.owner ?? ""} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} />
                <input aria-label="Due date" type="date" className={inputClass} value={draft.due_date ?? ""} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} />
                <input aria-label="Blocker" placeholder="卡住咩（如有）" className={inputClass} value={draft.blocker ?? ""} onChange={(event) => setDraft({ ...draft, blocker: event.target.value })} />
                <input aria-label="Waiting on" placeholder="等緊邊個" className={inputClass} value={draft.waiting_on ?? ""} onChange={(event) => setDraft({ ...draft, waiting_on: event.target.value })} />
                <div className="flex gap-2"><button className={buttonClass} disabled={busy === item.id || !draft.title?.trim()} onClick={() => void update(item, { title: draft.title, owner: draft.owner ?? null, due_date: draft.due_date || null, blocker: draft.blocker ?? null, waiting_on: draft.waiting_on ?? null })}>Save</button><button className={subtleButton} onClick={() => setEditing(null)}>Cancel</button></div>
              </div> : <div className="grid gap-2 sm:grid-cols-[7.5rem_1fr_auto] sm:items-start">
                <select aria-label={`Status of ${item.title}`} disabled={busy === item.id} className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${STATUS[item.status]?.className ?? ""}`} value={item.status} onChange={(event) => void update(item, { status: event.target.value })}>{STATUS_KEYS.map((key) => <option key={key} value={key}>{STATUS[key].label}</option>)}</select>
                <div><p className={`text-sm font-medium ${item.status === "done" || item.status === "skipped" ? "text-[#8A7A95] line-through" : "text-[#2F1D43]"}`}>{item.title}</p>
                  <p className="mt-0.5 text-xs text-[#766682]">{[KINDS[item.kind] ?? item.kind, shortDate(item.due_date), item.owner].filter(Boolean).join(" · ")}
                    {item.status === "blocked" && item.blocker ? <span className="text-[#8B2F2F]"> · 卡住：{item.blocker}</span> : null}
                    {item.status === "waiting" && item.waiting_on ? <span className="text-[#6B4E0E]"> · 等緊：{item.waiting_on}</span> : null}
                    {item.notes ? <span> · {item.notes}</span> : null}</p></div>
                <button className="text-xs font-semibold text-[#5B3576] underline" onClick={() => { setEditing(item.id); setDraft(item); }}>Edit</button>
              </div>}
            </li>)}</ul></div>)}</div>
          <form className="mt-5 grid gap-2 border-t border-[#EEE7F1] pt-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); void add(plan, phases[0] ?? "General"); }}>
            <input aria-label="New item" placeholder="加一樣嘢…" className={inputClass} value={newItem.title ?? ""} onChange={(event) => setAdding({ ...adding, [plan.id]: { ...newItem, title: event.target.value } })} />
            <select aria-label="Phase" className={inputClass} value={newItem.phase ?? phases[0] ?? "General"} onChange={(event) => setAdding({ ...adding, [plan.id]: { ...newItem, phase: event.target.value } })}>{(phases.length ? phases : ["General"]).map((phase) => <option key={phase}>{phase}</option>)}</select>
            <input aria-label="Owner" placeholder="負責人" className={inputClass} value={newItem.owner ?? ""} onChange={(event) => setAdding({ ...adding, [plan.id]: { ...newItem, owner: event.target.value } })} />
            <input aria-label="Due date" type="date" className={inputClass} value={newItem.due_date ?? ""} onChange={(event) => setAdding({ ...adding, [plan.id]: { ...newItem, due_date: event.target.value } })} />
            <button className={buttonClass} disabled={busy === `add-${plan.id}` || !newItem.title?.trim()}>Add</button>
          </form>
        </section>
      </article>;
    })}
  </div>;
}
