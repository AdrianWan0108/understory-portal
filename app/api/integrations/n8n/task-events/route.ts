import type { NextRequest } from "next/server";
import { aiAdmin, aiError } from "@/lib/ai-workspace/server";
import { taskEventSchema } from "@/lib/ai-workspace/schemas";
import { verifyAiPayload } from "@/lib/ai-workspace/signatures";
import { HIGH_RISK_ACTIONS, requiresHumanApproval } from "@/lib/ai-workspace/policy";

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
  const parsed = taskEventSchema.safeParse(payload);
  if (!parsed.success) return aiError("Invalid or unsupported event schema.", 400);
  const event = parsed.data;
  if (event.output?.kind === "approval_request" && !event.approval) return aiError("Approval output requires an approval request.", 400);
  if (event.approval && requiresHumanApproval(event.approval.action_type, event.approval.risk_level) && event.approval.risk_level !== "high") {
    return aiError("High-risk action must request high-risk approval.", 400);
  }
  const completedHighRiskActions = event.tool_actions.filter((action) => action.result === "success" && HIGH_RISK_ACTIONS.has(action.name));
  if (completedHighRiskActions.length) {
    const { data: task } = await aiAdmin().from("ai_tasks").select("assigned_agent").eq("id", event.task_id).maybeSingle();
    const { data: config } = task ? await aiAdmin().from("ai_agent_configs").select("allowed_actions").eq("agent_key", task.assigned_agent).maybeSingle() : { data: null };
    if (completedHighRiskActions.some((action) => !config?.allowed_actions?.includes(action.name))) return aiError("High-risk action is disabled for this agent.", 409);
    const { data: approved } = await aiAdmin().from("ai_approvals").select("action_type").eq("task_id", event.task_id).eq("status", "approved");
    if (completedHighRiskActions.some((action) => !(approved ?? []).some((approval) => approval.action_type === action.name))) {
      return aiError("High-risk tool action has no matching human approval.", 409);
    }
  }

  const { data, error } = await aiAdmin().rpc("ai_apply_task_event", { p_event: event });
  if (error) {
    if (error.message.includes("status transition")) return aiError("Invalid task status transition.", 409);
    if (error.message.includes("not found") || error.message.includes("correlation mismatch")) return aiError("Task or run not found.", 404);
    if (error.message.includes("requires output")) return aiError("Completed runs require a versioned output or approval request.", 400);
    return aiError("Could not record task event.", 500);
  }
  return Response.json(data);
}
