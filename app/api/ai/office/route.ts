import type { NextRequest } from "next/server";
import { aiAdmin, aiError } from "@/lib/ai-workspace/server";
import { verifyOfficeToken } from "@/lib/ai-workspace/office-token";

export const runtime = "nodejs";

// Read-only status snapshot for the desktop AI Office. It returns titles and
// stages only: no objectives, outputs, client data, costs or approval content.
export async function GET(request: NextRequest) {
  if (!verifyOfficeToken(process.env.AI_OFFICE_TOKEN ?? "", request.headers.get("authorization"))) return aiError("Invalid office token.", 401);
  const admin = aiAdmin();
  const [agents, configs, tasks, events, approvals] = await Promise.all([
    admin.from("ai_agents").select("key, name, responsibility, visual_key").order("name"),
    admin.from("ai_agent_configs").select("agent_key, enabled"),
    admin.from("ai_tasks").select("id, assigned_agent, title, status, priority, current_stage, requested_at, started_at, completed_at, portal_deep_link").order("requested_at", { ascending: false }).limit(150),
    admin.from("ai_task_events").select("id, task_id, kind, summary, created_at").order("created_at", { ascending: false }).limit(40),
    admin.from("ai_approvals").select("id, task_id").eq("status", "pending"),
  ]);
  if (agents.error || configs.error || tasks.error || events.error || approvals.error) return aiError("Could not load AI Office.", 500);
  const enabled = new Map((configs.data ?? []).map((config) => [config.agent_key, config.enabled]));
  return Response.json({
    schema_version: 1,
    generated_at: new Date().toISOString(),
    portal_origin: request.nextUrl.origin,
    agents: (agents.data ?? []).map((agent) => ({ ...agent, enabled: enabled.get(agent.key) ?? true })),
    tasks: tasks.data ?? [],
    events: events.data ?? [],
    pending_approvals: (approvals.data ?? []).map((approval) => approval.task_id),
  }, { headers: { "Cache-Control": "no-store" } });
}
