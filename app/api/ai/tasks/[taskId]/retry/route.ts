import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { aiActor, aiAdmin, aiError, sameOrigin } from "@/lib/ai-workspace/server";
import { signAiPayload } from "@/lib/ai-workspace/signatures";

export const runtime = "nodejs";
const retrySchema = z.object({ idempotency_key: z.string().min(16).max(200) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  if (!sameOrigin(request)) return aiError("Invalid origin.", 403);
  const actor = await aiActor(request);
  if (!actor || actor.role !== "owner") return aiError("Owner access is required.", 403);
  const parsed = retrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return aiError("Invalid retry request.", 400);
  const { taskId } = await params;
  const admin = aiAdmin();
  const { data: task } = await admin.from("ai_tasks").select("id, status, current_stage, correlation_id, assigned_agent, portal_deep_link, context_references").eq("id", taskId).maybeSingle();
  if (!task) return aiError("Task not found.", 404);
  if (task.status !== "failed") return aiError("Only failed tasks can be retried.", 409);
  const base = process.env.N8N_WEBHOOK_BASE_URL;
  const secret = process.env.N8N_PORTAL_SHARED_SECRET;
  if (!base || !secret || secret.length < 32) return aiError("n8n is not configured.", 409);
  const { data: prior } = await admin.from("ai_task_runs").select("id, tool_actions").eq("task_id", taskId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if ((prior?.tool_actions ?? []).some((action: { result?: string }) => action.result === "success")) return aiError("A completed tool action needs manual review before retry.", 409);
  const { data: existing } = await admin.from("ai_task_runs").select("id, task_id").eq("idempotency_key", parsed.data.idempotency_key).maybeSingle();
  if (existing && existing.task_id !== taskId) return aiError("Retry key belongs to another task.", 409);
  const runId = existing?.id ?? randomUUID();
  if (!existing) {
    const { error: runError } = await admin.from("ai_task_runs").insert({ id: runId, task_id: taskId, trigger_source: "portal",
      idempotency_key: parsed.data.idempotency_key, correlation_id: task.correlation_id, current_stage: task.current_stage,
      input_references: task.context_references });
    if (runError) return aiError("Could not create retry run.", 500);
  }
  await admin.from("ai_tasks").update({ status: "queued", error_details: null, updated_at: new Date().toISOString() }).eq("id", taskId).eq("status", "failed");
  if (!existing) await admin.from("ai_task_events").insert({ task_id: taskId, run_id: runId, event_key: `${parsed.data.idempotency_key}:retry`, kind: "retry",
    summary: `Retry requested from ${task.current_stage ?? "dispatch"}.`, actor_profile_id: actor.id, correlation_id: task.correlation_id });
  try {
    const endpoint = new URL(`${base.replace(/\/$/, "")}/ai-task`);
    if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost") throw new Error("HTTPS required.");
    const portalOrigin = (process.env.FRONTEND_URL ?? request.nextUrl.origin).replace(/\/$/, "");
    const body = JSON.stringify({ schema_version: 1, task_id: taskId, run_id: runId, previous_run_id: prior?.id === runId ? null : prior?.id ?? null,
      correlation_id: task.correlation_id, idempotency_key: parsed.data.idempotency_key,
      context_url: `${portalOrigin}/api/ai/tasks/${taskId}/context`, portal_deep_link: `${portalOrigin}${task.portal_deep_link}`, agent: task.assigned_agent,
      retry_from_stage: task.current_stage, do_not_repeat_external_actions: true });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "x-ai-timestamp": timestamp,
      "x-ai-signature": signAiPayload(secret, timestamp, body) }, body, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`n8n returned ${response.status}`);
  } catch {
    await admin.from("ai_tasks").update({ status: "failed", error_details: "Retry dispatch failed.", updated_at: new Date().toISOString() }).eq("id", taskId);
    return aiError("Retry dispatch failed; the task remains failed.", 502);
  }
  return Response.json({ run_id: runId, duplicate: Boolean(existing) }, { status: 202 });
}
