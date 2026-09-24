import type { NextRequest } from "next/server";
import { aiAdmin, aiError } from "@/lib/ai-workspace/server";
import { tasksToolRequestSchema } from "@/lib/ai-workspace/schemas";
import { verifyAiPayload } from "@/lib/ai-workspace/signatures";
import {
  authorizeTasksToolRequest,
  TASKS_TOOL_SELECT,
} from "@/lib/ai-workspace/tasks-tool";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyAiPayload({
    secret: process.env.N8N_PORTAL_SHARED_SECRET ?? "",
    timestamp: request.headers.get("x-ai-timestamp"),
    signature: request.headers.get("x-ai-signature"),
    body: raw,
  })) return aiError("Invalid integration signature.", 401);

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return aiError("Invalid JSON.", 400); }
  const parsed = tasksToolRequestSchema.safeParse(payload);
  if (!parsed.success) return aiError("Invalid tasks tool request.", 400);
  const input = parsed.data;
  const admin = aiAdmin();

  const { data: run, error: runError } = await admin.from("ai_task_runs")
    .select("task_id")
    .eq("id", input.run_id)
    .maybeSingle();
  if (runError) return aiError("Could not authorize tasks tool request.", 500);
  if (!run || run.task_id !== input.task_id) return aiError("Task or run not found.", 404);

  const { data: task, error: taskError } = await admin.from("ai_tasks")
    .select("id, assigned_agent, client_id, project_id")
    .eq("id", input.task_id)
    .maybeSingle();
  if (taskError) return aiError("Could not authorize tasks tool request.", 500);
  if (!task) return aiError("Task or run not found.", 404);

  const { data: config, error: configError } = await admin.from("ai_agent_configs")
    .select("allowed_tools, permitted_client_ids, permitted_project_ids")
    .eq("agent_key", task.assigned_agent)
    .maybeSingle();
  if (configError) return aiError("Could not authorize tasks tool request.", 500);

  const authorization = authorizeTasksToolRequest({ request: input, run, task, config });
  if (!authorization.ok) {
    if (authorization.reason === "task_or_run_not_found") return aiError("Task or run not found.", 404);
    if (authorization.reason === "tool_not_allowed") return aiError("Tasks tool is not allowed for this agent.", 403);
    return aiError("Requested filters conflict with the permitted task scope.", 403);
  }

  let query = admin.from("tasks")
    .select(TASKS_TOOL_SELECT)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(input.filters.limit);

  if (authorization.clientId) query = query.eq("client_id", authorization.clientId);
  else if (authorization.permittedClientIds.length) query = query.in("client_id", authorization.permittedClientIds);
  if (authorization.projectId) query = query.eq("division_task_id", authorization.projectId);
  else if (authorization.permittedProjectIds.length) query = query.in("division_task_id", authorization.permittedProjectIds);
  if (input.filters.due_before) query = query.lte("due_date", input.filters.due_before);

  const { data: tasks, error: tasksError } = await query;
  if (tasksError) return aiError("Could not read tasks.", 500);

  return Response.json({
    schema_version: 1,
    tool: "tasks",
    count: tasks?.length ?? 0,
    tasks: tasks ?? [],
  });
}
