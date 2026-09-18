import type { NextRequest } from "next/server";
import { aiActor, aiAdmin, aiError, authorizedAiTask } from "@/lib/ai-workspace/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const actor = await aiActor(request);
  if (!actor) return aiError("Sign in to AI Workspace.", 401);
  const { taskId } = await params;
  const task = await authorizedAiTask(actor, taskId);
  if (!task) return aiError("Task not found.", 404);
  const admin = aiAdmin();
  const [runs, events, approvals, usage] = await Promise.all([
    admin.from("ai_task_runs").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
    admin.from("ai_task_events").select("id, kind, summary, metadata, actor_profile_id, created_at, run_id").eq("task_id", taskId).order("created_at", { ascending: true }),
    admin.from("ai_approvals").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
    actor.role === "owner" ? admin.from("ai_provider_usage").select("provider, model, stage, input_tokens, output_tokens, credits, cost_usd, created_at").eq("task_id", taskId) : Promise.resolve({ data: [] }),
  ]);
  const visibleTask = actor.role === "owner" ? task : {
    id: task.id, client_id: task.client_id, project_id: task.project_id, content_item_id: task.content_item_id,
    assigned_agent: task.assigned_agent, title: task.title, objective: task.objective, priority: task.priority,
    status: task.status, approval_status: task.approval_status, current_stage: task.current_stage,
    output_summary: task.output_summary, structured_output: task.structured_output, output_version: task.output_version,
    portal_deep_link: task.portal_deep_link, requested_at: task.requested_at, completed_at: task.completed_at,
  };
  const visibleRuns = actor.role === "owner" ? runs.data : (runs.data ?? []).map((run) => ({ id: run.id, status: run.status, current_stage: run.current_stage,
    output_version: run.output_version, decision_summary: run.decision_summary, error_message: run.error_message, created_at: run.created_at, completed_at: run.completed_at }));
  const visibleApprovals = actor.role === "owner" ? approvals.data : (approvals.data ?? []).map((approval) => ({ id: approval.id, risk_level: approval.risk_level,
    requested_action: approval.requested_action, downstream_action: approval.downstream_action, output_preview: approval.output_preview,
    status: approval.status, decision_comment: approval.decision_comment, decision_at: approval.decision_at }));
  const visibleEvents = actor.role === "owner" ? events.data : (events.data ?? []).map((event) => ({ id: event.id, kind: event.kind,
    summary: event.summary, actor_profile_id: event.actor_profile_id, created_at: event.created_at, run_id: event.run_id }));
  return Response.json({ task: visibleTask, runs: visibleRuns ?? [], events: visibleEvents ?? [], approvals: visibleApprovals ?? [], usage: usage.data ?? [] });
}
