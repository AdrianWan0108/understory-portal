import type { EventsToolRequest } from "./schemas";

type EventsToolRun = { task_id: string } | null;
type EventsToolTask = { id: string; client_id: string | null; input_payload: Record<string, unknown> | null } | null;
type EventsToolConfig = { allowed_tools: string[] | null; permitted_client_ids: string[] | null } | null;

export type EventsToolAuthorization =
  | { ok: true; planId: string | null; clientId: string | null; permittedClientIds: string[] }
  | { ok: false; reason: "task_or_run_not_found" | "tool_not_allowed" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// The plan comes from the request, else from the task's input_payload.plan_id.
// Client scope is the task's client and the agent's permitted clients; the
// route also checks that the chosen plan belongs to that scope.
export function authorizeEventsToolRequest(input: {
  request: EventsToolRequest;
  run: EventsToolRun;
  task: EventsToolTask;
  config: EventsToolConfig;
}): EventsToolAuthorization {
  const { request, run, task, config } = input;
  if (!run || run.task_id !== request.task_id || !task || task.id !== request.task_id) {
    return { ok: false, reason: "task_or_run_not_found" };
  }
  if (!config?.allowed_tools?.includes("events")) return { ok: false, reason: "tool_not_allowed" };
  const payloadPlan = typeof task.input_payload?.plan_id === "string" && UUID.test(task.input_payload.plan_id) ? task.input_payload.plan_id : null;
  return {
    ok: true,
    planId: request.filters.plan_id ?? payloadPlan,
    clientId: task.client_id,
    permittedClientIds: config.permitted_client_ids ?? [],
  };
}

/** Whether a plan's client is inside the authorized scope. Plans with no client are internal and allowed. */
export function eventPlanInScope(plan: { client_id: string | null }, scope: { clientId: string | null; permittedClientIds: string[] }) {
  if (scope.clientId && plan.client_id !== scope.clientId) return false;
  if (scope.permittedClientIds.length && plan.client_id && !scope.permittedClientIds.includes(plan.client_id)) return false;
  return true;
}
