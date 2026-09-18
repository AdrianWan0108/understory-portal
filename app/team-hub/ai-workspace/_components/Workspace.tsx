"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { HIGH_RISK_ACTIONS } from "@/lib/ai-workspace/policy";
import {
  AI_WORKSPACE_NEXT_STORAGE_KEY,
  getSafeAiWorkspaceNext,
  startGithubAiWorkspaceOAuth,
  UNLINKED_AI_PROFILE_MESSAGE,
} from "@/lib/ai-workspace/auth";

type Section = "overview" | "agents" | "tasks" | "approvals" | "activity" | "settings" | "detail";
type Actor = { id: string; role: string; fullName: string };
type Agent = { key: string; name: string; responsibility: string; visual_key: string };
type Config = { agent_key: string; enabled: boolean; provider_routes: Record<string, { provider: string; model: string; when?: string; fallback?: { provider: string; model: string } }>; allowed_tools: string[]; allowed_actions: string[]; approval_policy: string; provider_limits: Record<string, number>; agent_limit_usd: number | null; slack_channel_id: string | null; schedule_config: Record<string, unknown>; context_sources: Array<{ label: string; url: string }>; permitted_client_ids: string[]; permitted_project_ids: string[] };
type Task = { id: string; client_id: string | null; project_id: string | null; content_item_id: string | null; requested_by: string; assigned_agent: string; title: string; objective: string; priority: string; status: string; approval_status: string; current_stage: string | null; output_summary: string | null; portal_deep_link: string; requested_at: string; completed_at: string | null; structured_output?: unknown; output_version?: number; error_details?: string | null };
type Approval = { id: string; task_id: string; risk_level: string; requested_action: string; downstream_action: string; output_preview: string | null; status: string; created_at: string; decision_at: string | null; decision_comment: string | null; resume_status?: string };
type Event = { id: string; task_id: string; kind: string; summary: string; created_at: string; run_id: string | null; metadata?: Record<string, unknown> };
type Usage = { task_id?: string; run_id?: string; provider: string; model: string; stage?: string; cost_usd: number | null; input_tokens: number | null; output_tokens: number | null; created_at: string };
type Run = { id: string; task_id: string; workflow_execution_id: string | null; trigger_source: string; status: string; provider: string | null; model: string | null; input_references: unknown[]; output_version: number; decision_summary: string | null; tool_actions: unknown[]; error_message: string | null; latency_ms: number | null; created_at: string; completed_at: string | null };
type Options = { clients: Array<{ id: string; name: string }>; projects: Array<{ id: string; client_id: string; title: string }>; people: Array<{ id: string; full_name: string }> };
type Overview = { tasks: Task[]; approvals: Approval[]; events: Event[]; usage: Usage[]; runs: Run[] };
type Detail = { task: Task; runs: Array<Record<string, unknown>>; events: Event[]; approvals: Approval[]; usage: Usage[] };

const base = "/team-hub/ai-workspace";
const links: Array<{ label: string; section: Section; href: string }> = [
  { label: "Overview", section: "overview", href: base }, { label: "Agents", section: "agents", href: `${base}/agents` },
  { label: "Tasks", section: "tasks", href: `${base}/tasks` }, { label: "Approvals", section: "approvals", href: `${base}/approvals` },
  { label: "Activity", section: "activity", href: `${base}/activity` }, { label: "Settings", section: "settings", href: `${base}/settings` },
];
const actionAgents = [
  ["Ask Operations", "operations"], ["Plan Content", "content"], ["Start Research", "research"],
  ["Create Design Draft", "creative"], ["Analyze Performance", "growth"],
] as const;
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const pill = (value: string) => <span className="inline-flex rounded-full border border-[#D9CEE3] bg-[#F4EDF9] px-2.5 py-0.5 text-[11px] font-medium text-[#5D3A75]">{label(value)}</span>;

class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError("Sign in with your Understory account.", 401);
  const response = await fetch(path, { ...init, cache: "no-store", headers: { ...init?.headers, Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(result.error ?? `Request failed (${response.status}).`, response.status);
  return result as T;
}

function Empty({ children }: { children: React.ReactNode }) { return <div className="rounded-xl border border-dashed border-[#CDBDD8] bg-white/70 px-5 py-8 text-sm text-[#766682]">{children}</div>; }
function Panel({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) { return <section className="rounded-2xl border border-[#DED2E5] bg-[#FFFDFB] p-5 shadow-[0_3px_14px_rgba(42,22,69,0.04)]"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-[#321D4B]">{title}</h2>{aside}</div>{children}</section>; }
function Field({ title, children }: { title: string; children: React.ReactNode }) { return <label className="block text-xs font-semibold text-[#59426B]">{title}<span className="mt-1.5 block">{children}</span></label>; }
const inputClass = "w-full rounded-lg border border-[#CDBDD8] bg-white px-3 py-2.5 text-sm font-normal text-[#2F1D43] focus:border-[#6B4882] focus:outline-none focus:ring-2 focus:ring-[#E9DCF1]";
const buttonClass = "rounded-lg bg-[#432560] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#32194C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698] disabled:opacity-50";
const subtleButton = "rounded-lg border border-[#CDBDD8] px-3.5 py-2 text-sm font-semibold text-[#58396D] hover:bg-[#F2EAF6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698] disabled:opacity-50";

type TaskFormState = { agent: string; title: string; objective: string; client_id: string; project_id: string; content_item_id: string; assigned_profile_id: string; priority: string };

export function Workspace({ section, taskId, taskDefaults }: { section: Section; taskId?: string; taskDefaults?: Partial<TaskFormState> }) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [githubRedirecting, setGithubRedirecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [options, setOptions] = useState<Options>({ clients: [], projects: [], people: [] });
  const [detail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState<Record<string, string>>({ agent: taskDefaults?.agent ?? "" });
  const [form, setForm] = useState<TaskFormState>({ agent: "operations", title: "", objective: "", client_id: "", project_id: "", content_item_id: "", assigned_profile_id: "", priority: "normal", ...taskDefaults });
  const [decisionComments, setDecisionComments] = useState<Record<string, string>>({});
  const [costFrom, setCostFrom] = useState("");
  const [costTo, setCostTo] = useState("");
  const createKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const online = () => setOffline(false);
    const offlineHandler = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineHandler);
    void supabase.auth.getSession().then(({ data }) => { setAuthReady(true); if (!data.session) setLoading(false); });
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offlineHandler); };
  }, []);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const me = await api<{ actor: Actor }>("/api/ai/me");
      setActor(me.actor);
      if (me.actor.role !== "owner" && section !== "detail") { setError("This view is available to owners only."); setLoading(false); return; }
      if (section === "detail" && taskId) { setDetail(await api<Detail>(`/api/ai/tasks/${taskId}`)); setLoading(false); return; }
      const [overviewResult, agentResult, optionResult, taskResult] = await Promise.all([
        api<Overview>(`/api/ai/overview?${new URLSearchParams({ ...(costFrom ? { from: costFrom } : {}), ...(costTo ? { to: costTo } : {}) })}`),
        api<{ agents: Agent[]; configs: Config[] }>("/api/ai/agents"),
        api<Options>("/api/ai/options"),
        api<{ tasks: Task[] }>(`/api/ai/tasks${filter.provider ? `?provider=${encodeURIComponent(filter.provider)}` : ""}`),
      ]);
      setOverview(overviewResult); setAgents(agentResult.agents); setConfigs(agentResult.configs); setOptions(optionResult); setTasks(taskResult.tasks);
    } catch (caught) {
      if (caught instanceof ApiError && [401, 403].includes(caught.status)) {
        const { data } = await supabase.auth.getSession();
        setActor(null);
        setError(data.session ? UNLINKED_AI_PROFILE_MESSAGE : "Your AI Workspace session expired. Please sign in again.");
      } else {
        setError(caught instanceof Error ? caught.message : "Could not load AI Workspace.");
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!authReady) return;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [authReady, section, taskId, costFrom, costTo, filter.provider]); // eslint-disable-line react-hooks/exhaustive-deps

  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (authError) { setError(authError.message); return; }
    setPassword(""); void refresh();
  }

  async function signInWithGithub() {
    setBusy(true); setGithubRedirecting(true); setError(null);
    const next = getSafeAiWorkspaceNext(`${window.location.pathname}${window.location.search}`);
    window.sessionStorage.setItem(AI_WORKSPACE_NEXT_STORAGE_KEY, next);
    const { error: authError } = await startGithubAiWorkspaceOAuth(
      (input) => supabase.auth.signInWithOAuth(input),
      window.location.origin,
    );
    if (authError) {
      window.sessionStorage.removeItem(AI_WORKSPACE_NEXT_STORAGE_KEY);
      setError("GitHub sign-in could not be started. Please try again.");
      setGithubRedirecting(false); setBusy(false);
    }
  }

  async function createTask(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    createKeyRef.current ??= crypto.randomUUID();
    try {
      const result = await api<{ task: Task }>("/api/ai/tasks", { method: "POST", body: JSON.stringify({ agent: form.agent, title: form.title, objective: form.objective,
        client_id: form.client_id || null, project_id: form.project_id || null, content_item_id: form.content_item_id || null,
        priority: form.priority, assigned_profile_id: form.assigned_profile_id || null, input_payload: {}, context_references: [], idempotency_key: createKeyRef.current }) });
      window.location.assign(result.task.portal_deep_link);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create task."); }
    setBusy(false);
  }

  async function updateConfig(patch: Partial<Config> & { agent_key: string }) {
    setBusy(true); setError(null);
    try { await api("/api/ai/agents", { method: "PATCH", body: JSON.stringify(patch) }); setNotice("Agent settings saved."); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save settings."); }
    setBusy(false);
  }

  async function decide(approval: Approval, decision: string) {
    setBusy(true); setError(null);
    try { await api(`/api/ai/approvals/${approval.id}/decision`, { method: "POST", body: JSON.stringify({ decision, comment: decisionComments[approval.id] ?? "", idempotency_key: crypto.randomUUID() }) });
      setNotice("Decision saved and sent to the workflow."); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save decision."); }
    setBusy(false);
  }

  if (!authReady || loading && !actor) return <div className="mx-auto max-w-6xl px-5 py-12 text-sm text-[#6A557A]" role="status">Loading AI Workspace…</div>;
  if (!actor) return <main className="mx-auto max-w-md px-5 py-12"><Panel title="AI Workspace sign in"><p className="mb-5 text-sm leading-6 text-[#6F5D7D]">Use a Supabase Auth account linked to your Understory profile. The Team Hub username alone cannot open AI work.</p><button type="button" disabled={busy} className={`${buttonClass} w-full`} onClick={() => void signInWithGithub()}>{githubRedirecting ? "Redirecting to GitHub…" : "Continue with GitHub"}</button><div className="my-5 flex items-center gap-3" aria-hidden="true"><span className="h-px flex-1 bg-[#DED2E5]" /><span className="text-xs font-medium uppercase tracking-[0.16em] text-[#8A7896]">or</span><span className="h-px flex-1 bg-[#DED2E5]" /></div><form onSubmit={signIn} className="space-y-4"><Field title="Email"><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></Field><Field title="Password"><input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} /></Field><button disabled={busy} className={subtleButton}>Sign in with email</button></form>{error && <p role="alert" className="mt-4 text-sm text-[#A13B43]">{error}</p>}</Panel></main>;

  const active = section === "detail" ? "tasks" : section;
  const clientName = (id: string | null) => options.clients.find((client) => client.id === id)?.name ?? (id ? "Client" : "Internal");
  const agentName = (key: string) => agents.find((agent) => agent.key === key)?.name ?? label(key);
  const taskById = (id: string) => overview?.tasks.find((task) => task.id === id);
  const visibleTasks = tasks.filter((task) => {
    if (filter.client && task.client_id !== filter.client) return false;
    if (filter.project && task.project_id !== filter.project) return false;
    if (filter.agent && task.assigned_agent !== filter.agent) return false;
    if (filter.requester && task.requested_by !== filter.requester) return false;
    if (filter.status && task.status !== filter.status) return false;
    if (filter.approval && task.approval_status !== filter.approval) return false;
    if (filter.from && task.requested_at.slice(0, 10) < filter.from) return false;
    if (filter.to && task.requested_at.slice(0, 10) > filter.to) return false;
    return true;
  });
  const statusCount = (status: string) => overview?.tasks.filter((task) => task.status === status).length ?? 0;
  const spend = overview?.usage.reduce((total, row) => total + Number(row.cost_usd ?? 0), 0) ?? 0;
  const providerTotals = Object.entries((overview?.usage ?? []).reduce<Record<string, { cost: number; tokens: number }>>((totals, row) => {
    const current = totals[row.provider] ?? { cost: 0, tokens: 0 };
    totals[row.provider] = { cost: current.cost + Number(row.cost_usd ?? 0), tokens: current.tokens + Number(row.input_tokens ?? 0) + Number(row.output_tokens ?? 0) };
    return totals;
  }, {}));

  return <main className="mx-auto max-w-[1400px] px-4 py-7 sm:px-7 lg:px-9">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div>{actor.role === "owner" && <Link href="/team-hub/dashboard" className="mb-2 inline-block text-xs font-semibold text-[#5B3576] underline">← Team Hub</Link>}<p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8A5DA3]">Internal · Understory</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-[#301A49]">AI Workspace</h1><p className="mt-1 text-sm text-[#766682]">Five functional agents · all outputs remain in the portal for review.</p></div><div className="flex items-center gap-3 text-xs text-[#6C577A]"><span>{actor.fullName}</span><button className={subtleButton} onClick={() => void supabase.auth.signOut().then(() => { setActor(null); setAuthReady(true); })}>Sign out</button></div></div>
    {actor.role === "owner" && <nav aria-label="AI Workspace sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-[#D9CCE3]">{links.map((item) => <Link key={item.href} href={item.href} aria-current={active === item.section ? "page" : undefined} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold focus-visible:outline-2 ${active === item.section ? "border-[#5B3576] text-[#3B2057]" : "border-transparent text-[#82718D] hover:text-[#4C2D66]"}`}>{item.label}</Link>)}</nav>}
    {offline && <p role="status" className="mb-4 rounded-lg border border-[#D8B979] bg-[#FFF8E5] px-4 py-3 text-sm text-[#684D1C]">You are offline. Live AI work cannot update until the connection returns.</p>}
    {error && <p role="alert" className="mb-4 rounded-lg border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]">{error} <button className="ml-2 underline" onClick={() => void refresh()}>Retry</button></p>}
    {notice && <p role="status" className="mb-4 rounded-lg border border-[#BFD8C4] bg-[#F0F8F1] px-4 py-3 text-sm text-[#2E6A40]">{notice}</p>}
    {loading ? <Empty>Loading current AI work…</Empty> : section === "overview" && overview ? <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{agents.map((agent) => { const config = configs.find((item) => item.agent_key === agent.key); const current = overview.tasks.find((task) => task.assigned_agent === agent.key && ["running", "waiting_for_approval"].includes(task.status)); const state = !config?.enabled ? "Paused" : current?.status === "running" ? "Working" : current?.status === "waiting_for_approval" ? "Waiting for Approval" : overview.tasks.some((task) => task.assigned_agent === agent.key && task.status === "failed") ? "Failed" : "Idle"; return <Link key={agent.key} href={`${base}/agents`} className="rounded-xl border border-[#DDD0E6] bg-[#FFFDFB] px-4 py-3 hover:border-[#9A7EB1]"><p className="text-xs font-semibold text-[#472963]">{agent.name}</p><p className="mt-1 text-[11px] text-[#786789]">{state}</p></Link>; })}</div>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]"><Panel title="Today’s AI work"><div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{["running", "queued", "waiting_for_approval", "completed", "failed"].map((status) => <div key={status} className="border-l-2 border-[#D6C5E0] pl-3"><p className="text-2xl font-semibold text-[#382151]">{statusCount(status)}</p><p className="text-xs text-[#776581]">{label(status)}</p></div>)}</div></Panel><Panel title="Provider usage" aside={<div className="flex flex-wrap gap-2"><input aria-label="Cost start date" type="date" value={costFrom} onChange={(event) => setCostFrom(event.target.value)} className={inputClass} /><input aria-label="Cost end date" type="date" value={costTo} onChange={(event) => setCostTo(event.target.value)} className={inputClass} /></div>}><p className="text-2xl font-semibold text-[#382151]">${spend.toFixed(2)}</p><p className="text-xs text-[#786789]">Recorded usage since {costFrom || "the last 30 days"}{costTo ? ` through ${costTo}` : ""}</p><div className="mt-3 divide-y divide-[#EEE7F1]">{providerTotals.map(([provider, total]) => <p key={provider} className="flex justify-between py-1.5 text-xs text-[#6D5B7A]"><span>{label(provider)} · {total.tokens.toLocaleString()} tokens</span><strong>${total.cost.toFixed(2)}</strong></p>)}</div></Panel></div>
      <div className="grid gap-5 lg:grid-cols-2"><Panel title="Priority recommendations and blockers">{overview.tasks.filter((task) => task.priority === "urgent" || task.priority === "high" || ["failed", "waiting_for_input"].includes(task.status)).slice(0, 6).map((task) => <TaskRow key={task.id} task={task} agentName={agentName(task.assigned_agent)} clientName={clientName(task.client_id)} />)}{!overview.tasks.some((task) => task.priority === "urgent" || task.priority === "high" || ["failed", "waiting_for_input"].includes(task.status)) && <Empty>No current blockers or high priority AI tasks.</Empty>}</Panel><Panel title="Upcoming scheduled runs">{configs.filter((config) => config.enabled && Object.keys(config.schedule_config ?? {}).length).map((config) => <p key={config.agent_key} className="border-b border-[#EEE7F1] py-2 text-sm"><strong>{agentName(config.agent_key)}</strong> · {JSON.stringify(config.schedule_config)}</p>)}{!configs.some((config) => config.enabled && Object.keys(config.schedule_config ?? {}).length) && <Empty>No schedules configured in the portal. n8n can still trigger signed runs.</Empty>}</Panel></div>
      <Panel title="Quick actions"><div className="flex flex-wrap gap-2">{actionAgents.map(([title, agent]) => <Link key={agent} href={`${base}/tasks?agent=${agent}`} className={subtleButton}>{title}</Link>)}</div></Panel>
      <Panel title="Recent activity">{overview.events.slice(0, 8).map((event) => <p key={event.id} className="border-b border-[#EEE7F1] py-2 text-sm"><Link href={`${base}/tasks/${event.task_id}`} className="font-semibold text-[#5B3576] hover:underline">{event.summary}</Link><span className="ml-2 text-xs text-[#897893]">{date(event.created_at)}</span></p>)}{!overview.events.length && <Empty>Run history will appear here when the first task starts.</Empty>}</Panel>
    </div> : null}
    {section === "agents" && <div className="space-y-3">{agents.map((agent) => { const config = configs.find((item) => item.agent_key === agent.key); const current = overview?.tasks.find((task) => task.assigned_agent === agent.key && ["running", "waiting_for_approval"].includes(task.status)); const last = overview?.tasks.find((task) => task.assigned_agent === agent.key && task.status === "completed"); return <Panel key={agent.key} title={agent.name} aside={<button disabled={busy} className={subtleButton} onClick={() => void updateConfig({ agent_key: agent.key, enabled: !config?.enabled })}>{config?.enabled ? "Pause" : "Resume"}</button>}><div className="grid gap-4 text-sm lg:grid-cols-[1.4fr_1fr_1fr]"><div><div className="flex items-center gap-3"><span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full border border-[#CAB5D8] bg-[#EEE4F4] text-xs font-bold text-[#56356D]">{agent.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><p className="text-[#665472]">{agent.responsibility}</p></div><p className="mt-3">{pill(config?.enabled ? current?.status ?? "idle" : "paused")}</p><p className="mt-3 text-xs text-[#756481]">Current: {current ? <Link className="underline" href={current.portal_deep_link}>{current.title}</Link> : "None"}</p><p className="mt-1 text-xs text-[#756481]">Last completed: {last ? <Link className="underline" href={last.portal_deep_link}>{last.title}</Link> : "None"}</p></div><div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#8A6A9C]">Powered by</p><div className="flex flex-wrap gap-1">{Object.values(config?.provider_routes ?? {}).map((route, index) => <span key={`${route.provider}-${index}`} className="rounded-md bg-[#EFE5F3] px-2 py-1 text-xs text-[#593D6E]">{label(route.provider)} · {route.model}</span>)}</div><p className="mt-3 text-xs text-[#756481]">Tools: {config?.allowed_tools.join(", ") || "None"}</p></div><div><p className="text-xs text-[#756481]">Approval: {config?.approval_policy}</p><p className="mt-2 text-xs text-[#756481]">Next run: {config?.schedule_config?.next_run ? String(config.schedule_config.next_run) : "Not scheduled"}</p><Link href={`${base}/tasks?agent=${agent.key}`} className="mt-4 inline-block text-xs font-semibold text-[#593D6E] underline">Open task history</Link></div></div></Panel>; })}</div>}
    {section === "tasks" && <div className="space-y-5"><Panel title="Request AI work"><form onSubmit={createTask} className="grid gap-3 md:grid-cols-2"><Field title="Agent"><select className={inputClass} value={form.agent} onChange={(event) => setForm({ ...form, agent: event.target.value })}>{agents.map((agent) => <option key={agent.key} value={agent.key}>{agent.name}</option>)}</select></Field><Field title="Priority"><select className={inputClass} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{["low", "normal", "high", "urgent"].map((value) => <option key={value}>{value}</option>)}</select></Field><Field title="Title"><input required maxLength={200} className={inputClass} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field><Field title="Client"><select className={inputClass} value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value, project_id: "" })}><option value="">Internal</option>{options.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field><Field title="Project"><select className={inputClass} value={form.project_id} onChange={(event) => setForm({ ...form, project_id: event.target.value })}><option value="">No project</option>{options.projects.filter((project) => !form.client_id || project.client_id === form.client_id).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></Field><Field title="Existing content item ID"><input className={inputClass} value={form.content_item_id} onChange={(event) => setForm({ ...form, content_item_id: event.target.value })} placeholder="Linked automatically from the calendar" /></Field><Field title="Assign to"><select className={inputClass} value={form.assigned_profile_id} onChange={(event) => setForm({ ...form, assigned_profile_id: event.target.value })}><option value="">No assignee</option>{options.people.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></Field><div className="md:col-span-2"><Field title="Objective"><textarea required rows={3} className={inputClass} value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} /></Field></div><div className="md:col-span-2"><button disabled={busy || offline} className={buttonClass}>Create durable task</button><span className="ml-3 text-xs text-[#82718D]">The request returns immediately; progress appears here.</span></div></form></Panel><Panel title="Task queue" aside={<span className="text-xs text-[#8A7896]">{visibleTasks.length} tasks</span>}><div className="mb-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-5"><FilterSelect title="Client" value={filter.client ?? ""} onChange={(value) => setFilter({ ...filter, client: value })} options={options.clients.map((item) => [item.id, item.name])} /><FilterSelect title="Project" value={filter.project ?? ""} onChange={(value) => setFilter({ ...filter, project: value })} options={options.projects.map((item) => [item.id, item.title])} /><FilterSelect title="Agent" value={filter.agent ?? ""} onChange={(value) => setFilter({ ...filter, agent: value })} options={agents.map((item) => [item.key, item.name])} /><FilterSelect title="Requester" value={filter.requester ?? ""} onChange={(value) => setFilter({ ...filter, requester: value })} options={options.people.map((item) => [item.id, item.full_name])} /><FilterSelect title="Status" value={filter.status ?? ""} onChange={(value) => setFilter({ ...filter, status: value })} options={["queued", "running", "waiting_for_input", "waiting_for_approval", "completed", "failed", "cancelled"].map((item) => [item, label(item)])} /><FilterSelect title="Approval" value={filter.approval ?? ""} onChange={(value) => setFilter({ ...filter, approval: value })} options={["not_required", "pending", "approved", "changes_requested", "rejected"].map((item) => [item, label(item)])} /><FilterSelect title="Provider" value={filter.provider ?? ""} onChange={(value) => setFilter({ ...filter, provider: value })} options={["anthropic", "openai", "perplexity", "worker"].map((item) => [item, label(item)])} /><Field title="From"><input type="date" className={inputClass} value={filter.from ?? ""} onChange={(event) => setFilter({ ...filter, from: event.target.value })} /></Field><Field title="To"><input type="date" className={inputClass} value={filter.to ?? ""} onChange={(event) => setFilter({ ...filter, to: event.target.value })} /></Field></div><div className="divide-y divide-[#EEE7F1]">{visibleTasks.map((task) => <TaskRow key={task.id} task={task} agentName={agentName(task.assigned_agent)} clientName={clientName(task.client_id)} />)}</div>{!visibleTasks.length && <Empty>No tasks match these filters.</Empty>}</Panel></div>}
    {section === "approvals" && <div className="space-y-4">{overview?.approvals.filter((approval) => approval.status === "pending").map((approval) => <Panel key={approval.id} title={taskById(approval.task_id)?.title ?? "Approval request"} aside={pill(approval.risk_level)}><p className="text-sm text-[#59466B]">{approval.output_preview || "No preview supplied."}</p><dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div><dt className="font-bold">Requested action</dt><dd>{approval.requested_action}</dd></div><div><dt className="font-bold">Approval unlocks</dt><dd>{approval.downstream_action}</dd></div></dl><Field title="Comment (optional)"><textarea className={inputClass} rows={2} value={decisionComments[approval.id] ?? ""} onChange={(event) => setDecisionComments({ ...decisionComments, [approval.id]: event.target.value })} /></Field><div className="mt-3 flex flex-wrap gap-2">{[["Approve", "approved"], ["Request changes", "changes_requested"], ["Reject", "rejected"]].map(([title, decision]) => <button key={decision} disabled={busy} className={decision === "approved" ? buttonClass : subtleButton} onClick={() => void decide(approval, decision)}>{title}</button>)}<Link href={`${base}/tasks/${approval.task_id}`} className={subtleButton}>Open task</Link></div></Panel>)}{!overview?.approvals.some((item) => item.status === "pending") && <Empty>No approval requests are waiting.</Empty>}<Panel title="Decision history">{overview?.approvals.filter((approval) => approval.status !== "pending").map((approval) => <div key={approval.id} className="border-b border-[#EEE7F1] py-2 text-sm"><Link className="font-semibold text-[#593D6E] underline" href={`${base}/tasks/${approval.task_id}`}>{taskById(approval.task_id)?.title ?? approval.task_id}</Link> · {label(approval.status)} · {date(approval.decision_at)}{approval.decision_comment && <span className="block text-xs text-[#7C6A88]">{approval.decision_comment}</span>}{approval.resume_status === "failed" && <button disabled={busy} className="mt-2 block text-xs font-semibold text-[#9A4047] underline" onClick={() => void decide(approval, approval.status)}>Retry workflow resume</button>}</div>)}{!overview?.approvals.some((item) => item.status !== "pending") && <Empty>No decisions recorded yet.</Empty>}</Panel></div>}
    {section === "activity" && <div className="space-y-5"><Panel title="Run history"><div className="divide-y divide-[#EEE7F1]">{overview?.runs.map((run) => <div key={run.id} className="grid gap-2 py-3 text-sm lg:grid-cols-[10rem_1.2fr_1fr_auto]"><time className="text-xs text-[#8A7896]">{date(run.created_at)}</time><div><Link className="font-semibold text-[#5B3576] underline" href={`${base}/tasks/${run.task_id}`}>{taskById(run.task_id)?.title ?? "AI task"}</Link><p className="text-xs text-[#776581]">{label(run.trigger_source)} · {run.workflow_execution_id ?? "No execution ID"} · version {run.output_version}</p></div><div><p>{pill(run.status)} <span className="text-xs">{run.provider ? `${label(run.provider)} · ${run.model ?? ""}` : "Provider pending"}</span></p><p className="mt-1 text-xs text-[#776581]">{run.latency_ms !== null ? `${run.latency_ms} ms` : "—"} · ${overview.usage.filter((item) => item.run_id === run.id).reduce((sum, item) => sum + Number(item.cost_usd ?? 0), 0).toFixed(4)}</p>{run.error_message && <p className="mt-1 text-xs text-[#9A4047]">{run.error_message}</p>}</div><details className="text-xs text-[#685376]"><summary className="cursor-pointer font-semibold">Details</summary><p className="mt-2">{run.decision_summary || "No decision summary."}</p><pre className="mt-2 max-w-72 overflow-auto whitespace-pre-wrap">Inputs: {JSON.stringify(run.input_references)}{"\n"}Tools: {JSON.stringify(run.tool_actions)}</pre></details></div>)}</div>{!overview?.runs.length && <Empty>No agent runs yet.</Empty>}</Panel><Panel title="Audit events"><div className="divide-y divide-[#EEE7F1]">{overview?.events.map((event) => <div key={event.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[11rem_1fr_auto]"><time className="text-xs text-[#8A7896]">{date(event.created_at)}</time><div><strong className="text-[#3B2353]">{label(event.kind)}</strong><p className="text-[#6D5B7A]">{event.summary}</p></div><Link className="text-xs font-semibold text-[#5B3576] underline" href={`${base}/tasks/${event.task_id}`}>Open task</Link></div>)}</div>{!overview?.events.length && <Empty>No audit events yet.</Empty>}</Panel></div>}
    {section === "settings" && <div className="space-y-4"><p className="text-sm text-[#776581]">Providers are selected by stage. API keys remain in n8n; this page stores model names and routing rules only.</p>{configs.map((config) => <SettingsCard key={`${config.agent_key}:${JSON.stringify(config)}`} config={config} name={agentName(config.agent_key)} busy={busy} options={options} onSave={updateConfig} />)}<Panel title="Connection status"><p className="text-sm text-[#756481]">The n8n connection is checked on the server without revealing its shared secret.</p><button className={`${subtleButton} mt-3`} onClick={() => void api<{ reachable: boolean; status: number | null; latency_ms: number }>("/api/ai/connections/test", { method: "POST" }).then((result) => setNotice(result.reachable ? `n8n responded in ${result.latency_ms} ms.` : `n8n did not respond successfully${result.status ? ` (${result.status})` : ""}.`)).catch((caught) => setError(String(caught)))}>Test n8n connection</button></Panel></div>}
    {section === "detail" && detail && <TaskDetail detail={detail} actor={actor} onRefresh={refresh} />}
  </main>;
}

function FilterSelect({ title, value, onChange, options }: { title: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <Field title={title}><select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}><option value="">All</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></Field>; }
function TaskRow({ task, agentName, clientName }: { task: Task; agentName: string; clientName: string }) { return <Link href={task.portal_deep_link} className="grid gap-1 py-3 text-sm hover:bg-[#F9F4FB] sm:grid-cols-[1.5fr_1fr_auto] sm:items-center"><div><strong className="text-[#3C2455]">{task.title}</strong><p className="line-clamp-1 text-xs text-[#7B6B85]">{clientName} · {agentName}</p></div><p className="text-xs text-[#7B6B85]">{date(task.requested_at)}</p>{pill(task.status)}</Link>; }

function SettingsCard({ config, name, busy, options, onSave }: { config: Config; name: string; busy: boolean; options: Options; onSave: (patch: Partial<Config> & { agent_key: string }) => Promise<void> }) {
  const [draft, setDraft] = useState(config);
  const [routesText, setRoutesText] = useState(JSON.stringify(config.provider_routes, null, 2));
  const [limitsText, setLimitsText] = useState(JSON.stringify(config.provider_limits, null, 2));
  const [scheduleText, setScheduleText] = useState(JSON.stringify(config.schedule_config, null, 2));
  const [sourcesText, setSourcesText] = useState(JSON.stringify(config.context_sources, null, 2));
  const [parseError, setParseError] = useState("");
  function save() {
    try {
      const provider_routes = JSON.parse(routesText);
      const provider_limits = JSON.parse(limitsText);
      const schedule_config = JSON.parse(scheduleText);
      const context_sources = JSON.parse(sourcesText);
      setParseError("");
      void onSave({ ...draft, provider_routes, provider_limits, schedule_config, context_sources, agent_key: config.agent_key });
    } catch { setParseError("Provider routes, limits, schedule, and context sources must be valid JSON."); }
  }
  return <Panel title={name} aside={pill(draft.enabled ? "enabled" : "paused")}>
    <div className="grid gap-3 md:grid-cols-2">
      <Field title="Provider routes (JSON)"><textarea rows={8} className={inputClass} value={routesText} onChange={(event) => setRoutesText(event.target.value)} /></Field>
      <div className="space-y-3">
        <Field title="Allowed tools, comma separated"><input className={inputClass} value={draft.allowed_tools.join(", ")} onChange={(event) => setDraft({ ...draft, allowed_tools: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></Field>
        <Field title="Permitted high-risk actions (approval required)"><select multiple size={4} className={inputClass} value={draft.allowed_actions} onChange={(event) => setDraft({ ...draft, allowed_actions: Array.from(event.target.selectedOptions, (option) => option.value) })}>{Array.from(HIGH_RISK_ACTIONS).map((action) => <option key={action} value={action}>{label(action)}</option>)}</select></Field>
        <Field title="Approval policy"><input className={inputClass} value={draft.approval_policy} onChange={(event) => setDraft({ ...draft, approval_policy: event.target.value })} /></Field>
        <Field title="Slack channel ID"><input className={inputClass} value={draft.slack_channel_id ?? ""} onChange={(event) => setDraft({ ...draft, slack_channel_id: event.target.value || null })} /></Field>
      </div>
      <Field title="Provider monthly limits (JSON, USD)"><textarea rows={2} className={inputClass} value={limitsText} onChange={(event) => setLimitsText(event.target.value)} /></Field>
      <Field title="Agent limit (USD)"><input type="number" min="0" step="0.01" className={inputClass} value={draft.agent_limit_usd ?? ""} onChange={(event) => setDraft({ ...draft, agent_limit_usd: event.target.value ? Number(event.target.value) : null })} /></Field>
      <Field title="Permitted clients (none means all)"><select multiple size={4} className={inputClass} value={draft.permitted_client_ids} onChange={(event) => setDraft({ ...draft, permitted_client_ids: Array.from(event.target.selectedOptions, (option) => option.value) })}>{options.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field>
      <Field title="Permitted projects (none means all)"><select multiple size={4} className={inputClass} value={draft.permitted_project_ids} onChange={(event) => setDraft({ ...draft, permitted_project_ids: Array.from(event.target.selectedOptions, (option) => option.value) })}>{options.projects.filter((project) => !draft.permitted_client_ids.length || draft.permitted_client_ids.includes(project.client_id)).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></Field>
      <Field title="Schedule configuration (JSON)"><textarea rows={3} className={inputClass} value={scheduleText} onChange={(event) => setScheduleText(event.target.value)} /></Field>
      <Field title="Brand/context sources (JSON)"><textarea rows={3} className={inputClass} value={sourcesText} onChange={(event) => setSourcesText(event.target.value)} /></Field>
    </div>
    {parseError && <p role="alert" className="mt-3 text-sm text-[#9A4047]">{parseError}</p>}
    <div className="mt-4 flex gap-2"><button disabled={busy} className={buttonClass} onClick={save}>Save settings</button><button disabled={busy} className={subtleButton} onClick={() => void onSave({ agent_key: config.agent_key, enabled: !draft.enabled })}>{draft.enabled ? "Pause" : "Resume"}</button></div>
  </Panel>;
}

function TaskDetail({ detail, actor, onRefresh }: { detail: Detail; actor: Actor; onRefresh: () => Promise<void> }) {
  const { task } = detail;
  const [design, setDesign] = useState<{ figma_file_url: string | null; figma_frame_url: string | null; design_status: string } | null>(null);
  const [figmaUrl, setFigmaUrl] = useState("");
  const [figmaFrameUrl, setFigmaFrameUrl] = useState("");
  const [designNotice, setDesignNotice] = useState("");
  const retryKeyRef = useRef<string | null>(null);
  useEffect(() => { if (task.content_item_id && actor.role === "owner") void api<{ design: typeof design }>(`/api/ai/designs/${task.content_item_id}`).then((result) => { setDesign(result.design); setFigmaUrl(result.design?.figma_file_url ?? ""); setFigmaFrameUrl(result.design?.figma_frame_url ?? ""); }); }, [task.content_item_id, actor.role]);
  async function retryTask() { retryKeyRef.current ??= crypto.randomUUID(); try { await api(`/api/ai/tasks/${task.id}/retry`, { method: "POST", body: JSON.stringify({ idempotency_key: retryKeyRef.current }) }); await onRefresh(); } catch (caught) { setDesignNotice(caught instanceof Error ? caught.message : "Retry failed."); } }
  async function saveDesign() { if (!task.content_item_id) return; try { const result = await api<{ design: typeof design }>(`/api/ai/designs/${task.content_item_id}`, { method: "PATCH", body: JSON.stringify({ figma_file_url: figmaUrl || null, figma_frame_url: figmaFrameUrl || null, design_status: "human_editing" }) }); setDesign(result.design); setDesignNotice("Figma link attached to the existing content item."); } catch (caught) { setDesignNotice(String(caught)); } }
  return <div className="space-y-5"><Link href={`${base}/tasks`} className="text-sm font-semibold text-[#5B3576] underline">← Task queue</Link><Panel title={task.title} aside={pill(task.status)}><p className="text-sm leading-6 text-[#655471]">{task.objective}</p><div className="mt-4 flex flex-wrap gap-2 text-xs text-[#776581]"><span>Agent: {label(task.assigned_agent)}</span><span>·</span><span>Priority: {label(task.priority)}</span><span>·</span><span>Stage: {task.current_stage ?? "—"}</span><span>·</span><span>Requested: {date(task.requested_at)}</span></div>{task.output_summary && <p className="mt-4 border-l-2 border-[#B69CC7] pl-3 text-sm text-[#48335C]">{task.output_summary}</p>}{task.error_details && <p className="mt-3 text-sm text-[#9A4047]">{task.error_details}</p>}</Panel><div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]"><Panel title={`Structured output · version ${task.output_version ?? 0}`}>{task.structured_output ? <pre className="overflow-auto whitespace-pre-wrap rounded-lg bg-[#F5EFF8] p-4 text-xs leading-5 text-[#3B2B4A]">{JSON.stringify(task.structured_output, null, 2)}</pre> : <Empty>No output yet. The task remains an internal draft until a human promotes it through an existing workflow.</Empty>}</Panel><Panel title="Approvals">{detail.approvals.map((approval) => <div key={approval.id} className="mb-3 border-b border-[#EEE7F1] pb-3 text-sm"><div className="flex gap-2">{pill(approval.status)}{pill(approval.risk_level)}</div><p className="mt-2">{approval.requested_action}</p><p className="mt-1 text-xs text-[#796987]">Unlocks: {approval.downstream_action}</p>{approval.decision_at && <p className="mt-2 text-xs">{date(approval.decision_at)} · {approval.decision_comment}</p>}{approval.resume_status === "failed" && <p className="mt-1 text-xs text-[#9A4047]">Workflow resume failed. Review the n8n execution.</p>}</div>)}{!detail.approvals.length && <Empty>No approval requests.</Empty>}</Panel></div>{task.content_item_id && actor.role === "owner" && <Panel title="Design delivery"><p className="mb-3 text-sm text-[#756481]">Attach a Figma file manually when no design worker is connected. Current status: {design?.design_status ?? "not started"}.</p><div className="flex gap-2"><input type="url" aria-label="Figma file URL" placeholder="Figma file URL" value={figmaUrl} onChange={(event) => setFigmaUrl(event.target.value)} className={inputClass} /><input type="url" aria-label="Figma frame URL" placeholder="Figma frame URL (optional)" value={figmaFrameUrl} onChange={(event) => setFigmaFrameUrl(event.target.value)} className={inputClass} /><button className={buttonClass} onClick={() => void saveDesign()}>Attach</button></div>{designNotice && <p className="mt-2 text-xs" role="status">{designNotice}</p>}</Panel>}<Panel title="Run history">{detail.runs.map((run) => <div key={String(run.id)} className="border-b border-[#EEE7F1] py-3 text-sm"><strong>{label(String(run.status))}</strong><span className="ml-2 text-xs text-[#8A7896]">{date(String(run.created_at))}</span><p className="text-xs text-[#786887]">{String(run.current_stage ?? "—")} · {String(run.provider ?? "No provider yet")} {String(run.model ?? "")}</p>{Boolean(run.decision_summary) && <p className="mt-1 text-xs">{String(run.decision_summary)}</p>}{Boolean(run.error_message) && <p className="mt-1 text-xs text-[#9A4047]">{String(run.error_message)}</p>}</div>)}{!detail.runs.length && <Empty>No runs recorded.</Empty>}</Panel><Panel title="Audit events">{detail.events.map((event) => <div key={event.id} className="border-b border-[#EEE7F1] py-2 text-sm"><span className="font-semibold">{label(event.kind)}</span> · {event.summary}<span className="ml-2 text-xs text-[#8A7896]">{date(event.created_at)}</span></div>)}</Panel>{actor.role === "owner" && <Panel title="Provider usage">{detail.usage.map((item, index) => <p key={index} className="border-b border-[#EEE7F1] py-2 text-sm">{label(item.provider)} · {item.model} · ${Number(item.cost_usd ?? 0).toFixed(4)} · {item.input_tokens ?? 0}/{item.output_tokens ?? 0} tokens</p>)}{!detail.usage.length && <Empty>No usage recorded.</Empty>}</Panel>}{task.status === "failed" && actor.role === "owner" && <button className={buttonClass} onClick={() => void retryTask()}>Retry failed stage</button>}<button className={subtleButton} onClick={() => void onRefresh()}>Refresh status</button>{designNotice && <p role="status" className="text-xs">{designNotice}</p>}</div>;
}
