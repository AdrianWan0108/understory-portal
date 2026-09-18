import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createAiTaskSchema } from "@/lib/ai-workspace/schemas";
import { aiActor, aiAdmin, aiError, sameOrigin, validateTaskLinks } from "@/lib/ai-workspace/server";
import { signAiPayload } from "@/lib/ai-workspace/signatures";
import { aiSlackNotification } from "@/lib/ai-workspace/slack-message";
import { canReadAiTask } from "@/lib/ai-workspace/policy";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const actor = await aiActor(request);
  if (!actor) return aiError("Sign in to AI Workspace.", 401);
  const admin = aiAdmin();
  const params = request.nextUrl.searchParams;
  let query = admin.from("ai_tasks").select("id, client_id, project_id, content_item_id, requested_by, assigned_profile_id, assigned_agent, title, objective, priority, status, approval_status, current_stage, output_summary, portal_deep_link, requested_at, started_at, completed_at, created_at, updated_at").order("requested_at", { ascending: false }).limit(200);
  const provider = params.get("provider");
  if (provider && ["anthropic", "openai", "perplexity", "worker"].includes(provider)) {
    const { data: providerUsage } = await admin.from("ai_provider_usage").select("task_id").eq("provider", provider).limit(5000);
    const ids = [...new Set((providerUsage ?? []).map((row) => row.task_id))];
    if (!ids.length) return Response.json({ tasks: [] });
    query = query.in("id", ids);
  }
  if (actor.role === "contractor") query = query.eq("assigned_profile_id", actor.id);
  for (const [key, column] of [["client", "client_id"], ["project", "project_id"], ["agent", "assigned_agent"], ["requester", "requested_by"], ["status", "status"], ["approval", "approval_status"]] as const) {
    const value = params.get(key);
    if (value) query = query.eq(column, value);
  }
  const dateFrom = params.get("from");
  const dateTo = params.get("to");
  if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) query = query.gte("requested_at", `${dateFrom}T00:00:00Z`);
  if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) query = query.lte("requested_at", `${dateTo}T23:59:59Z`);
  const { data, error } = await query;
  if (error) return aiError("Could not load AI tasks.", 500);
  if (actor.role !== "staff") return Response.json({ tasks: data ?? [] });
  const projectIds = [...new Set((data ?? []).map((task) => task.project_id).filter((id): id is string => Boolean(id)))];
  const contentIds = [...new Set((data ?? []).map((task) => task.content_item_id).filter((id): id is string => Boolean(id)))];
  const [projects, contents] = await Promise.all([
    projectIds.length ? admin.from("division_tasks").select("id, assignee_usernames, watcher_usernames, mentioned_usernames").in("id", projectIds) : Promise.resolve({ data: [] }),
    contentIds.length ? admin.from("tasks").select("id, assignee_usernames, watcher_usernames, mentioned_usernames").in("id", contentIds) : Promise.resolve({ data: [] }),
  ]);
  const projectMap = new Map((projects.data ?? []).map((project) => [project.id, project]));
  const contentMap = new Map((contents.data ?? []).map((content) => [content.id, content]));
  const visible = (data ?? []).filter((task) => canReadAiTask({ role: actor.role, profileId: actor.id, teamUsername: actor.teamUsername,
    task, projectAccess: task.project_id ? projectMap.get(task.project_id) : null, contentAccess: task.content_item_id ? contentMap.get(task.content_item_id) : null }));
  return Response.json({ tasks: visible });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return aiError("Invalid origin.", 403);
  const actor = await aiActor(request);
  if (!actor || actor.role !== "owner") return aiError("Owner access is required to request AI work.", 403);
  const parsed = createAiTaskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return aiError("Invalid task request.", 400);
  const input = parsed.data;
  const links = await validateTaskLinks(input);
  if (!links) return aiError("Client, project, and content item must refer to the same client.", 400);
  const admin = aiAdmin();
  if (input.assigned_profile_id) {
    const { data: assignee } = await admin.from("profiles").select("id, role").eq("id", input.assigned_profile_id).maybeSingle();
    if (!assignee || !["owner", "staff", "contractor"].includes(assignee.role)) return aiError("Assignee must be an internal team member.", 400);
  }
  const { data: config } = await admin.from("ai_agent_configs").select("enabled, permitted_client_ids, permitted_project_ids, provider_routes, provider_limits, agent_limit_usd, slack_channel_id").eq("agent_key", input.agent).maybeSingle();
  if (!config?.enabled) return aiError("This agent is paused.", 409);
  if (config.permitted_client_ids?.length && (!links.client_id || !config.permitted_client_ids.includes(links.client_id))) return aiError("Agent is not permitted for this client.", 403);
  if (config.permitted_project_ids?.length && (!links.project_id || !config.permitted_project_ids.includes(links.project_id))) return aiError("Agent is not permitted for this project.", 403);
  if (config.agent_limit_usd !== null) {
    const { data: cost, error: costError } = await admin.rpc("ai_agent_monthly_cost", { p_agent_key: input.agent });
    if (costError) return aiError("Could not check the agent usage limit.", 500);
    if (Number(cost) >= Number(config.agent_limit_usd)) return aiError("Monthly agent usage limit reached.", 429);
  }
  const primary = config.provider_routes?.primary ?? config.provider_routes?.interpretation;
  const primaryProvider = primary?.provider as string | undefined;
  const providerLimit = primaryProvider ? config.provider_limits?.[primaryProvider] : undefined;
  if (providerLimit !== undefined) {
    const { data: cost, error: costError } = await admin.rpc("ai_provider_monthly_cost", { p_provider: primaryProvider });
    if (costError) return aiError("Could not check the provider usage limit.", 500);
    if (Number(cost) >= Number(providerLimit)) return aiError("Monthly provider usage limit reached.", 429);
  }
  const candidateId = randomUUID();
  const runId = randomUUID();
  const correlationId = randomUUID();
  const candidateLink = `/team-hub/ai-workspace/tasks/${candidateId}`;
  const { data: created, error: createError } = await admin.rpc("ai_create_task", {
    p_task: { id: candidateId, ...links, requested_by: actor.id, assigned_profile_id: input.assigned_profile_id ?? null,
      assigned_agent: input.agent, title: input.title, objective: input.objective, input_payload: input.input_payload,
      context_references: input.context_references, priority: input.priority, portal_deep_link: candidateLink,
      idempotency_key: input.idempotency_key, correlation_id: correlationId },
    p_run: { id: runId, trigger_source: "portal", idempotency_key: `${input.idempotency_key}:run:1` },
    p_event: { event_key: `${input.idempotency_key}:created`, summary: "Task requested in the portal." },
  });
  if (createError || !created) return aiError("Could not save the AI task and its audit record.", 500);
  const task = { id: created.id as string, portal_deep_link: created.portal_deep_link as string, status: created.status as string };
  if (created.duplicate) return Response.json({ task, duplicate: true });
  const id = task.id;
  const portalDeepLink = task.portal_deep_link;
  const portalOrigin = (process.env.FRONTEND_URL ?? request.nextUrl.origin).replace(/\/$/, "");
  const { data: client } = links.client_id ? await admin.from("clients").select("name").eq("id", links.client_id).maybeSingle() : { data: null };
  const base = process.env.N8N_WEBHOOK_BASE_URL;
  const secret = process.env.N8N_PORTAL_SHARED_SECRET;
  let finalStatus = "queued";
  if (base && secret && secret.length >= 32) {
    try {
      const endpoint = new URL(`${base.replace(/\/$/, "")}/ai-task`);
      if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost") throw new Error("n8n URL must use HTTPS.");
      const body = JSON.stringify({ schema_version: 1, task_id: id, run_id: runId, correlation_id: correlationId, idempotency_key: input.idempotency_key,
        context_url: `${portalOrigin}/api/ai/tasks/${id}/context`, portal_deep_link: `${portalOrigin}${portalDeepLink}`, agent: input.agent,
        slack_notification: { channel_id: config.slack_channel_id, update_existing_thread: true,
          text: aiSlackNotification({ client: client?.name ?? "Internal", title: input.title, agent: input.agent, status: "Queued",
            requester: actor.fullName, date: new Date().toISOString(), summary: input.objective, url: `${portalOrigin}${portalDeepLink}` }) } });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "x-ai-timestamp": timestamp, "x-ai-signature": signAiPayload(secret, timestamp, body) }, body, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`n8n returned ${response.status}`);
      await admin.from("ai_task_events").insert({ task_id: id, run_id: runId, event_key: `${input.idempotency_key}:dispatched`, kind: "dispatched", summary: "Sent to n8n.", actor_profile_id: actor.id, correlation_id: correlationId });
    } catch {
      finalStatus = "failed";
      await admin.from("ai_tasks").update({ status: "failed", current_stage: "dispatch", error_details: "Could not dispatch to n8n. Retry from the task page.", updated_at: new Date().toISOString() }).eq("id", id);
      await admin.from("ai_task_events").insert({ task_id: id, run_id: runId, event_key: `${input.idempotency_key}:dispatch_failed`, kind: "failure", summary: "n8n dispatch failed.", actor_profile_id: actor.id, correlation_id: correlationId });
    }
  } else {
    finalStatus = "waiting_for_input";
    await admin.from("ai_tasks").update({ status: "waiting_for_input", current_stage: "integration_setup", updated_at: new Date().toISOString() }).eq("id", id);
  }
  return Response.json({ task: { ...task, status: finalStatus }, duplicate: false }, { status: 202 });
}
