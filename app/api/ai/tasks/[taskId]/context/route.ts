import type { NextRequest } from "next/server";
import { aiAdmin, aiError } from "@/lib/ai-workspace/server";
import { verifyAiPayload } from "@/lib/ai-workspace/signatures";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const runId = request.headers.get("x-ai-run-id");
  const secret = process.env.N8N_PORTAL_SHARED_SECRET ?? "";
  if (!runId || !verifyAiPayload({ secret, timestamp: request.headers.get("x-ai-timestamp"), signature: request.headers.get("x-ai-signature"), body: `GET:${taskId}:${runId}` })) {
    return aiError("Invalid integration signature.", 401);
  }
  const admin = aiAdmin();
  const { data: run } = await admin.from("ai_task_runs").select("id, task_id").eq("id", runId).eq("task_id", taskId).maybeSingle();
  if (!run) return aiError("Run not found.", 404);
  const { data: task } = await admin.from("ai_tasks").select("id, assigned_agent, client_id, project_id, content_item_id, title, objective, input_payload, context_references, priority, status, correlation_id").eq("id", taskId).maybeSingle();
  if (!task) return aiError("Task not found.", 404);
  const [client, project, content, config, profile, memories, reports] = await Promise.all([
    task.client_id ? admin.from("clients").select("id, name, slug").eq("id", task.client_id).maybeSingle() : null,
    task.project_id ? admin.from("division_tasks").select("id, title, description, status, due_date, client_id").eq("id", task.project_id).maybeSingle() : null,
    task.content_item_id ? admin.from("tasks").select("id, title, description, status, production_status, publishing_status, due_date, scheduled_at, post_caption, platform_captions, platform, format").eq("id", task.content_item_id).maybeSingle() : null,
    admin.from("ai_agent_configs").select("provider_routes, provider_limits, agent_limit_usd, allowed_tools, allowed_actions, approval_policy, context_sources").eq("agent_key", task.assigned_agent).maybeSingle(),
    task.client_id ? admin.from("client_profiles").select("industry, target_audience, unique_value_prop, competitors, brand_voice, goals, challenges").eq("client_id", task.client_id).maybeSingle() : null,
    task.client_id && ["content", "research", "creative"].includes(task.assigned_agent) ? admin.from("assistant_memories").select("category, content, updated_at").eq("client_id", task.client_id).order("updated_at", { ascending: false }).limit(30) : null,
    task.client_id && task.assigned_agent === "growth" ? admin.from("client_analytics_reports").select("id, title, report_month, google_slides_url, is_published").eq("client_id", task.client_id).order("report_month", { ascending: false }).limit(12) : null,
  ]);
  return Response.json({ schema_version: 1, task, run_id: runId, client: client?.data ?? null, project: project?.data ?? null,
    content_item: content?.data ?? null, client_profile: profile?.data ?? null, brand_memories: memories?.data ?? [],
    analytics_report_references: reports?.data ?? [], agent_config: config.data ?? null });
}
