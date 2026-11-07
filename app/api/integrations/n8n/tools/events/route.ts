import type { NextRequest } from "next/server";
import { aiAdmin, aiError } from "@/lib/ai-workspace/server";
import { eventsToolRequestSchema } from "@/lib/ai-workspace/schemas";
import { verifyAiPayload } from "@/lib/ai-workspace/signatures";
import { authorizeEventsToolRequest, eventPlanInScope } from "@/lib/ai-workspace/events-tool";
import {
  EVENT_ITEM_SELECT,
  EVENT_PLAN_SELECT,
  isOpenItem,
  summarizeEventPlan,
  type EventItemRecord,
  type EventPlanRecord,
} from "@/lib/ai-workspace/event-board";

export const runtime = "nodejs";

// Read-only Event Planner tool. Returns each plan in scope with its items and
// the deterministic summary (progress, blockers, overdue, due soon).
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
  const parsed = eventsToolRequestSchema.safeParse(payload);
  if (!parsed.success) return aiError("Invalid events tool request.", 400);
  const input = parsed.data;
  const admin = aiAdmin();

  const { data: run, error: runError } = await admin.from("ai_task_runs").select("task_id").eq("id", input.run_id).maybeSingle();
  if (runError) return aiError("Could not authorize events tool request.", 500);
  const { data: task, error: taskError } = await admin.from("ai_tasks")
    .select("id, assigned_agent, client_id, input_payload, requested_by").eq("id", input.task_id).maybeSingle();
  if (taskError) return aiError("Could not authorize events tool request.", 500);
  const { data: config, error: configError } = task
    ? await admin.from("ai_agent_configs").select("allowed_tools, permitted_client_ids").eq("agent_key", task.assigned_agent).maybeSingle()
    : { data: null, error: null };
  if (configError) return aiError("Could not authorize events tool request.", 500);

  const authorization = authorizeEventsToolRequest({ request: input, run, task, config });
  if (!authorization.ok) {
    return authorization.reason === "tool_not_allowed"
      ? aiError("Events tool is not allowed for this agent.", 403)
      : aiError("Task or run not found.", 404);
  }

  let planQuery = admin.from("event_plans").select(EVENT_PLAN_SELECT).order("start_date", { ascending: true }).limit(10);
  planQuery = authorization.planId ? planQuery.eq("id", authorization.planId) : planQuery.in("status", ["planning", "live"]);
  const { data: planRows, error: planError } = await planQuery;
  if (planError) return aiError("Could not read event plans.", 500);
  const plans = ((planRows ?? []) as EventPlanRecord[]).filter((plan) => eventPlanInScope(plan, authorization));
  if (authorization.planId && !plans.length) return aiError("Event plan is outside the permitted task scope.", 403);

  const { data: itemRows, error: itemError } = plans.length
    ? await admin.from("event_plan_items").select(EVENT_ITEM_SELECT).in("plan_id", plans.map((plan) => plan.id))
      .order("sort_order", { ascending: true })
    : { data: [], error: null };
  if (itemError) return aiError("Could not read event plan items.", 500);
  const items = (itemRows ?? []) as EventItemRecord[];
  // "Your to-dos" are the open items owned by the person who asked for the check.
  const { data: requester } = await admin.from("profiles").select("full_name").eq("id", task!.requested_by).maybeSingle();
  const me = requester?.full_name ? [requester.full_name] : [];

  return Response.json({
    schema_version: 1,
    tool: "events",
    count: plans.length,
    plans: plans.map((plan) => {
      const planItems = items.filter((item) => item.plan_id === plan.id);
      return {
        plan,
        summary: summarizeEventPlan(plan, planItems, { me }),
        requester_name: requester?.full_name ?? null,
        items: input.filters.include_done ? planItems : planItems.filter(isOpenItem),
      };
    }),
  });
}
