import type { NextRequest } from "next/server";
import { aiAdmin, aiError } from "@/lib/ai-workspace/server";
import { assetsToolRequestSchema } from "@/lib/ai-workspace/schemas";
import { verifyAiPayload } from "@/lib/ai-workspace/signatures";
import {
  ASSETS_TOOL_SELECT,
  assetsToolFilters,
  authorizeAssetsToolRequest,
} from "@/lib/ai-workspace/assets-tool";

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
  const parsed = assetsToolRequestSchema.safeParse(payload);
  if (!parsed.success) return aiError("Invalid assets tool request.", 400);
  const input = parsed.data;
  const admin = aiAdmin();

  const { data: run, error: runError } = await admin.from("ai_task_runs")
    .select("task_id")
    .eq("id", input.run_id)
    .maybeSingle();
  if (runError) return aiError("Could not authorize assets tool request.", 500);
  if (!run || run.task_id !== input.task_id) return aiError("Task or run not found.", 404);

  const { data: task, error: taskError } = await admin.from("ai_tasks")
    .select("id, assigned_agent, client_id, project_id")
    .eq("id", input.task_id)
    .maybeSingle();
  if (taskError) return aiError("Could not authorize assets tool request.", 500);
  if (!task) return aiError("Task or run not found.", 404);

  const { data: config, error: configError } = await admin.from("ai_agent_configs")
    .select("allowed_tools, permitted_client_ids, permitted_project_ids")
    .eq("agent_key", task.assigned_agent)
    .maybeSingle();
  if (configError) return aiError("Could not authorize assets tool request.", 500);

  const authorization = authorizeAssetsToolRequest({ request: input, run, task, config });
  if (!authorization.ok) {
    if (authorization.reason === "task_or_run_not_found") return aiError("Task or run not found.", 404);
    if (authorization.reason === "tool_not_allowed") return aiError("Assets tool is not allowed for this agent.", 403);
    if (authorization.reason === "client_scope_required") return aiError("Assets tool requires a client scope.", 403);
    return aiError("Requested filters conflict with the permitted task scope.", 403);
  }

  let query = admin.from("client_assets")
    .select(ASSETS_TOOL_SELECT)
    .order("created_at", { ascending: false })
    .limit(input.filters.limit);

  for (const filter of assetsToolFilters(authorization, input.filters)) {
    if (filter.op === "in") query = query.in(filter.column, filter.values);
    else query = query.eq(filter.column, filter.value);
  }

  const { data: assets, error: assetsError } = await query;
  if (assetsError) return aiError("Could not read assets.", 500);

  return Response.json({
    schema_version: 1,
    tool: "assets",
    count: assets?.length ?? 0,
    assets: assets ?? [],
  });
}
