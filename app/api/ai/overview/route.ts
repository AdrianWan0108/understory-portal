import type { NextRequest } from "next/server";
import { aiActor, aiAdmin, aiError } from "@/lib/ai-workspace/server";

export async function GET(request: NextRequest) {
  const actor = await aiActor(request);
  if (!actor || actor.role !== "owner") return aiError("Owner access is required.", 403);
  const admin = aiAdmin();
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const since = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00Z` : new Date(Date.now() - 30 * 86400000).toISOString();
  let usageQuery = admin.from("ai_provider_usage").select("task_id, run_id, provider, model, stage, input_tokens, output_tokens, credits, cost_usd, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(1000);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) usageQuery = usageQuery.lte("created_at", `${to}T23:59:59Z`);
  const [tasks, approvals, usage, events, runs] = await Promise.all([
    admin.from("ai_tasks").select("id, assigned_agent, title, status, approval_status, priority, output_summary, current_stage, requested_at, completed_at, portal_deep_link, client_id").order("requested_at", { ascending: false }).limit(150),
    admin.from("ai_approvals").select("id, task_id, risk_level, requested_action, downstream_action, output_preview, status, created_at, decision_at, decision_comment, resume_status").order("created_at", { ascending: false }).limit(100),
    usageQuery,
    admin.from("ai_task_events").select("id, task_id, kind, summary, created_at, run_id").order("created_at", { ascending: false }).limit(100),
    admin.from("ai_task_runs").select("id, task_id, workflow_execution_id, trigger_source, status, provider, model, input_references, output_version, decision_summary, tool_actions, error_message, latency_ms, created_at, completed_at").order("created_at", { ascending: false }).limit(100),
  ]);
  if (tasks.error || approvals.error || usage.error || events.error || runs.error) return aiError("Could not load AI Workspace.", 500);
  return Response.json({ tasks: tasks.data ?? [], approvals: approvals.data ?? [], usage: usage.data ?? [], events: events.data ?? [], runs: runs.data ?? [] });
}
