import type { TasksToolRequest } from "./schemas";

export const TASKS_TOOL_SELECT = [
  "id",
  "client_id",
  "division_task_id",
  "title",
  "brief",
  "status",
  "production_status",
  "publishing_status",
  "due_date",
  "scheduled_at",
  "platform",
  "format",
  "assignee_usernames",
  "watcher_usernames",
  "mentioned_usernames",
  "created_at",
].join(", ");

type TasksToolRun = { task_id: string } | null;
type TasksToolTask = {
  id: string;
  assigned_agent: string;
  client_id: string | null;
  project_id: string | null;
} | null;
type TasksToolConfig = {
  allowed_tools: string[] | null;
  permitted_client_ids: string[] | null;
  permitted_project_ids: string[] | null;
} | null;

type TasksToolAuthorization =
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

export function authorizeTasksToolRequest(input: {
  request: TasksToolRequest;
  run: TasksToolRun;
  task: TasksToolTask;
  config: TasksToolConfig;
}): TasksToolAuthorization {
  const { request, run, task, config } = input;
  if (!run || run.task_id !== request.task_id || !task || task.id !== request.task_id) {
    return { ok: false, reason: "task_or_run_not_found" };
  }
  if (!config?.allowed_tools?.includes("tasks")) {
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
