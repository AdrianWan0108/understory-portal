import type { NextRequest } from "next/server";
import { z } from "zod";
import { createAiTaskSchema, uuidSchema } from "@/lib/ai-workspace/schemas";
import { aiAdmin, aiError, validateTaskLinks } from "@/lib/ai-workspace/server";
import { verifyAiPayload } from "@/lib/ai-workspace/signatures";

export const runtime = "nodejs";

const externalTaskSchema = z.object({ schema_version: z.literal(1), task_id: uuidSchema, run_id: uuidSchema, event_id: uuidSchema,
  correlation_id: uuidSchema, trigger_source: z.enum(["slack", "schedule", "webhook", "system_event"]),
  requester_profile_id: uuidSchema.optional(), slack_user_id: z.string().min(1).optional(), task: createAiTaskSchema });

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyAiPayload({ secret: process.env.N8N_PORTAL_SHARED_SECRET ?? "", timestamp: request.headers.get("x-ai-timestamp"),
    signature: request.headers.get("x-ai-signature"), body: raw })) return aiError("Invalid integration signature.", 401);
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return aiError("Invalid JSON.", 400); }
  const parsed = externalTaskSchema.safeParse(payload);
  if (!parsed.success) return aiError("Invalid task request.", 400);
  const input = parsed.data;
  const admin = aiAdmin();
  if (input.trigger_source === "slack" && !input.slack_user_id) return aiError("Slack user ID is required.", 400);
  let requesterQuery = admin.from("profiles").select("id, role");
  if (input.trigger_source === "slack" && input.slack_user_id) requesterQuery = requesterQuery.eq("slack_user_id", input.slack_user_id);
  else if (input.requester_profile_id) requesterQuery = requesterQuery.eq("id", input.requester_profile_id);
  else return aiError("Verified requester is required.", 400);
  const { data: requester } = await requesterQuery.maybeSingle();
  if (!requester || requester.role !== "owner") return aiError("Owner requester is required.", 403);
  const links = await validateTaskLinks(input.task);
  if (!links) return aiError("Client, project, and content item must refer to the same client.", 400);
  if (input.task.assigned_profile_id) {
    const { data: assignee } = await admin.from("profiles").select("id, role").eq("id", input.task.assigned_profile_id).maybeSingle();
    if (!assignee || !["owner", "staff", "contractor"].includes(assignee.role)) return aiError("Assignee must be internal.", 400);
  }
  const { data: config } = await admin.from("ai_agent_configs").select("enabled, permitted_client_ids, permitted_project_ids, provider_routes, provider_limits, agent_limit_usd").eq("agent_key", input.task.agent).maybeSingle();
  if (!config?.enabled) return aiError("Agent is paused.", 409);
  if (config.permitted_client_ids?.length && (!links.client_id || !config.permitted_client_ids.includes(links.client_id))) return aiError("Client is not permitted.", 403);
  if (config.permitted_project_ids?.length && (!links.project_id || !config.permitted_project_ids.includes(links.project_id))) return aiError("Project is not permitted.", 403);
  if (config.agent_limit_usd !== null) {
    const { data: cost, error: costError } = await admin.rpc("ai_agent_monthly_cost", { p_agent_key: input.task.agent });
    if (costError) return aiError("Could not check the agent usage limit.", 500);
    if (Number(cost) >= Number(config.agent_limit_usd)) return aiError("Monthly agent usage limit reached.", 429);
  }
  const primary = config.provider_routes?.primary ?? config.provider_routes?.interpretation;
  const primaryProvider = primary?.provider as string | undefined;
  const providerLimit = primaryProvider ? config.provider_limits?.[primaryProvider] : undefined;
  if (providerLimit !== undefined) {
    const { data: cost, error: costError } = await admin.rpc("ai_provider_monthly_cost", { p_provider: primaryProvider });
    if (costError) return aiError("Could not check provider usage limit.", 500);
    if (Number(cost) >= Number(providerLimit)) return aiError("Monthly provider usage limit reached.", 429);
  }
  const portalDeepLink = `/team-hub/ai-workspace/tasks/${input.task_id}`;
  const { data: created, error: createError } = await admin.rpc("ai_create_task", {
    p_task: { id: input.task_id, ...links, requested_by: requester.id, assigned_agent: input.task.agent,
      assigned_profile_id: input.task.assigned_profile_id ?? null, title: input.task.title, objective: input.task.objective,
      input_payload: input.task.input_payload, context_references: input.task.context_references,
      priority: input.task.priority, portal_deep_link: portalDeepLink, idempotency_key: input.task.idempotency_key,
      correlation_id: input.correlation_id, slack_user_id: input.slack_user_id ?? null },
    p_run: { id: input.run_id, trigger_source: input.trigger_source, idempotency_key: `${input.task.idempotency_key}:run:1` },
    p_event: { event_key: input.event_id, summary: `Task requested by ${input.trigger_source}.` },
  });
  if (createError || !created) return aiError("Could not create durable task and audit record.", 500);
  return Response.json({ task: { id: created.id, portal_deep_link: created.portal_deep_link, status: created.status },
    run_id: created.run_id, duplicate: Boolean(created.duplicate) }, { status: created.duplicate ? 200 : 201 });
}
