import type { ProjectsToolRequest } from "./schemas";

// Team Hub "Projects" are rows in public.division_tasks. Large specialized JSON
// (content_brief_data, research_entries, filming_card_data) and figjam_embed_url
// are intentionally omitted.
export const PROJECTS_TOOL_SELECT = [
  "id",
  "client_id",
  "division",
  "title",
  "description",
  "status",
  "template_type",
  "assignee_usernames",
  "watcher_usernames",
  "mentioned_usernames",
  "start_date",
  "due_date",
  "created_at",
].join(", ");

// Matches the Team Hub Projects UI, which hides internal_approval records
// (rows with no template_type remain visible there too).
export const PROJECTS_TOOL_VISIBILITY_FILTER = "template_type.is.null,template_type.neq.internal_approval";

type ProjectsToolRun = { task_id: string } | null;
type ProjectsToolTask = {
  id: string;
  assigned_agent: string;
  client_id: string | null;
  project_id: string | null;
} | null;
type ProjectsToolConfig = {
  allowed_tools: string[] | null;
  permitted_client_ids: string[] | null;
  permitted_project_ids: string[] | null;
} | null;

type ProjectsToolAuthorization =
  | {
      ok: true;
      clientId: string | null;
      projectId: string | null;
      permittedClientIds: string[];
      permittedProjectIds: string[];
    }
  | {
      ok: false;
      reason: "task_or_run_not_found" | "tool_not_allowed" | "client_scope_conflict" | "project_scope_conflict";
    };

export function authorizeProjectsToolRequest(input: {
  request: ProjectsToolRequest;
  run: ProjectsToolRun;
  task: ProjectsToolTask;
  config: ProjectsToolConfig;
}): ProjectsToolAuthorization {
  const { request, run, task, config } = input;
  if (!run || run.task_id !== request.task_id || !task || task.id !== request.task_id) {
    return { ok: false, reason: "task_or_run_not_found" };
  }
  if (!config?.allowed_tools?.includes("projects")) {
    return { ok: false, reason: "tool_not_allowed" };
  }

  const requestedClientId = request.filters.client_id ?? null;
  const requestedProjectId = request.filters.project_id ?? null;
  if (task.client_id && requestedClientId && task.client_id !== requestedClientId) {
    return { ok: false, reason: "client_scope_conflict" };
  }
  if (task.project_id && requestedProjectId && task.project_id !== requestedProjectId) {
    return { ok: false, reason: "project_scope_conflict" };
  }

  const clientId = task.client_id ?? requestedClientId;
  const projectId = task.project_id ?? requestedProjectId;
  const permittedClientIds = config.permitted_client_ids ?? [];
  const permittedProjectIds = config.permitted_project_ids ?? [];
  if (clientId && permittedClientIds.length && !permittedClientIds.includes(clientId)) {
    return { ok: false, reason: "client_scope_conflict" };
  }
  if (projectId && permittedProjectIds.length && !permittedProjectIds.includes(projectId)) {
    return { ok: false, reason: "project_scope_conflict" };
  }

  return { ok: true, clientId, projectId, permittedClientIds, permittedProjectIds };
}

export type ProjectsToolFilter =
  | { op: "or"; value: string }
  | { op: "eq" | "gte" | "lte"; column: string; value: string }
  | { op: "in"; column: string; values: string[] };

// Builds the fixed filter plan for public.division_tasks: the internal_approval
// exclusion, the authorized scope, then the validated request filters. Request
// input never names columns or operators.
export function projectsToolFilters(
  authorization: Extract<ProjectsToolAuthorization, { ok: true }>,
  filters: ProjectsToolRequest["filters"],
): ProjectsToolFilter[] {
  const plan: ProjectsToolFilter[] = [{ op: "or", value: PROJECTS_TOOL_VISIBILITY_FILTER }];
  if (authorization.clientId) plan.push({ op: "eq", column: "client_id", value: authorization.clientId });
  if (authorization.permittedClientIds.length) plan.push({ op: "in", column: "client_id", values: authorization.permittedClientIds });
  if (authorization.projectId) plan.push({ op: "eq", column: "id", value: authorization.projectId });
  if (authorization.permittedProjectIds.length) plan.push({ op: "in", column: "id", values: authorization.permittedProjectIds });
  if (filters.division?.length) plan.push({ op: "in", column: "division", values: filters.division });
  if (filters.status?.length) plan.push({ op: "in", column: "status", values: filters.status });
  if (filters.due_after) plan.push({ op: "gte", column: "due_date", value: filters.due_after });
  if (filters.due_before) plan.push({ op: "lte", column: "due_date", value: filters.due_before });
  return plan;
}
