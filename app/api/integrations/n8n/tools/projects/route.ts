import type { NextRequest } from "next/server";
import { aiAdmin, aiError } from "@/lib/ai-workspace/server";
import { projectsToolRequestSchema } from "@/lib/ai-workspace/schemas";
import { verifyAiPayload } from "@/lib/ai-workspace/signatures";
import {
  authorizeProjectsToolRequest,
  PROJECTS_TOOL_SELECT,
  projectsToolFilters,
} from "@/lib/ai-workspace/projects-tool";

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
  const parsed = projectsToolRequestSchema.safeParse(payload);
  if (!parsed.success) return aiError("Invalid projects tool request.", 400);
  const input = parsed.data;
  const admin = aiAdmin();

  const { data: run, error: runError } = await admin.from("ai_task_runs")
    .select("task_id")
    .eq("id", input.run_id)
    .maybeSingle();
  if (runError) return aiError("Could not authorize projects tool request.", 500);
  if (!run || run.task_id !== input.task_id) return aiError("Task or run not found.", 404);

  const { data: task, error: taskError } = await admin.from("ai_tasks")
    .select("id, assigned_agent, client_id, project_id")
    .eq("id", input.task_id)
    .maybeSingle();
  if (taskError) return aiError("Could not authorize projects tool request.", 500);
  if (!task) return aiError("Task or run not found.", 404);

  const { data: config, error: configError } = await admin.from("ai_agent_configs")
    .select("allowed_tools, permitted_client_ids, permitted_project_ids")
    .eq("agent_key", task.assigned_agent)
    .maybeSingle();
  if (configError) return aiError("Could not authorize projects tool request.", 500);

  const authorization = authorizeProjectsToolRequest({ request: input, run, task, config });
  if (!authorization.ok) {
    if (authorization.reason === "task_or_run_not_found") return aiError("Task or run not found.", 404);
    if (authorization.reason === "tool_not_allowed") return aiError("Projects tool is not allowed for this agent.", 403);
    return aiError("Requested filters conflict with the permitted task scope.", 403);
  }

  let query = admin.from("division_tasks")
    .select(PROJECTS_TOOL_SELECT)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(input.filters.limit);

  for (const filter of projectsToolFilters(authorization, input.filters)) {
    if (filter.op === "or") query = query.or(filter.value);
    else if (filter.op === "in") query = query.in(filter.column, filter.values);
    else if (filter.op === "eq") query = query.eq(filter.column, filter.value);
    else if (filter.op === "gte") query = query.gte(filter.column, filter.value);
    else query = query.lte(filter.column, filter.value);
  }

  const { data: projects, error: projectsError } = await query;
  if (projectsError) return aiError("Could not read projects.", 500);

  return Response.json({
    schema_version: 1,
    tool: "projects",
    count: projects?.length ?? 0,
    projects: projects ?? [],
  });
}
