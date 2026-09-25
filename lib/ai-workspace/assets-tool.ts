import type { AssetsToolRequest } from "./schemas";

// Only facts stored in public.client_assets. uploaded_by is intentionally omitted.
export const ASSETS_TOOL_SELECT = [
  "id",
  "client_id",
  "file_url",
  "file_name",
  "file_type",
  "created_at",
].join(", ");

type AssetsToolRun = { task_id: string } | null;
type AssetsToolTask = {
  id: string;
  assigned_agent: string;
  client_id: string | null;
  project_id: string | null;
} | null;
type AssetsToolConfig = {
  allowed_tools: string[] | null;
  permitted_client_ids: string[] | null;
  permitted_project_ids: string[] | null;
} | null;

type AssetsToolAuthorization =
  | { ok: true; clientId: string | null; permittedClientIds: string[] }
  | {
      ok: false;
      reason: "task_or_run_not_found" | "tool_not_allowed" | "client_scope_conflict" | "client_scope_required" | "project_scope_conflict";
    };

export function authorizeAssetsToolRequest(input: {
  request: AssetsToolRequest;
  run: AssetsToolRun;
  task: AssetsToolTask;
  config: AssetsToolConfig;
}): AssetsToolAuthorization {
  const { request, run, task, config } = input;
  if (!run || run.task_id !== request.task_id || !task || task.id !== request.task_id) {
    return { ok: false, reason: "task_or_run_not_found" };
  }
  if (!config?.allowed_tools?.includes("assets")) {
    return { ok: false, reason: "tool_not_allowed" };
  }

  const requestedClientId = request.filters.client_id ?? null;
  if (task.client_id && requestedClientId && task.client_id !== requestedClientId) {
    return { ok: false, reason: "client_scope_conflict" };
  }

  const clientId = task.client_id ?? requestedClientId;
  const permittedClientIds = config.permitted_client_ids ?? [];
  const permittedProjectIds = config.permitted_project_ids ?? [];
  if (clientId && permittedClientIds.length && !permittedClientIds.includes(clientId)) {
    return { ok: false, reason: "client_scope_conflict" };
  }
  if (task.project_id && permittedProjectIds.length && !permittedProjectIds.includes(task.project_id)) {
    return { ok: false, reason: "project_scope_conflict" };
  }
  // Assets belong to clients, so an unscoped task cannot list every client's assets.
  if (!clientId && !permittedClientIds.length) {
    return { ok: false, reason: "client_scope_required" };
  }

  return { ok: true, clientId, permittedClientIds };
}

export type AssetsToolFilter =
  | { op: "eq"; column: string; value: string }
  | { op: "in"; column: string; values: string[] };

// Builds the fixed filter plan for public.client_assets. Request input never names columns or operators.
export function assetsToolFilters(
  authorization: Extract<AssetsToolAuthorization, { ok: true }>,
  filters: AssetsToolRequest["filters"],
): AssetsToolFilter[] {
  const plan: AssetsToolFilter[] = [];
  if (authorization.clientId) plan.push({ op: "eq", column: "client_id", value: authorization.clientId });
  if (authorization.permittedClientIds.length) plan.push({ op: "in", column: "client_id", values: authorization.permittedClientIds });
  if (filters.file_type?.length) plan.push({ op: "in", column: "file_type", values: filters.file_type });
  return plan;
}
