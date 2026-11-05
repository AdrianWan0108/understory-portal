import type { NextRequest } from "next/server";
import { aiActor, aiAdmin, aiError, sameOrigin } from "@/lib/ai-workspace/server";
import { CANCELLABLE_STATUSES } from "@/lib/ai-workspace/stale";

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  if (!sameOrigin(request)) return aiError("Invalid origin.", 403);
  const actor = await aiActor(request);
  if (!actor || actor.role !== "owner") return aiError("Owner access is required.", 403);
  const { taskId } = await params;
  const admin = aiAdmin();
  const { data: task } = await admin.from("ai_tasks").select("id, status, correlation_id").eq("id", taskId).maybeSingle();
  if (!task) return aiError("Task not found.", 404);
  if (task.status === "cancelled") return Response.json({ status: "cancelled", duplicate: true });
  if (!CANCELLABLE_STATUSES.has(task.status)) return aiError("This task can no longer be cancelled.", 409);
  // Conditional on the status we read, so a concurrent n8n event wins cleanly.
  const now = new Date().toISOString();
  const { data: updated, error } = await admin.from("ai_tasks").update({ status: "cancelled", current_stage: "cancelled", updated_at: now })
    .eq("id", taskId).eq("status", task.status).select("id").maybeSingle();
  if (error) return aiError("Could not cancel the task.", 500);
  if (!updated) return aiError("The task changed while cancelling. Refresh and try again.", 409);
  await admin.from("ai_task_events").insert({ task_id: taskId, event_key: `cancel:${taskId}`, kind: "configuration",
    summary: `Cancelled by ${actor.fullName}.`, actor_profile_id: actor.id, correlation_id: task.correlation_id });
  return Response.json({ status: "cancelled" });
}
