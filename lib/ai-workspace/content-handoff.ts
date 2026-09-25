import type { ContentResult } from "./schemas";

export const CONTENT_HANDOFF_SELECT = "id, assigned_agent, status, client_id, project_id, content_item_id, structured_output, completed_at, created_at";

export type ContentHandoffTask = {
  id: string;
  assigned_agent: string;
  client_id: string | null;
  project_id: string | null;
  content_item_id: string | null;
};
export type ContentHandoffCandidate = ContentHandoffTask & {
  status: string;
  structured_output: unknown;
  completed_at: string | null;
  created_at: string;
};
// Pass contentResultSchema from ./schemas; it is a parameter so this module has no runtime imports.
export type ContentResultValidator = {
  safeParse(value: unknown): { success: true; data: ContentResult } | { success: false };
};
export type ContentHandoff = {
  source_task_id: string;
  completed_at: string | null;
  content_result: ContentResult;
};

// Only Creative tasks linked to an existing content item receive a Content Agent handoff.
export function shouldLookupContentHandoff(task: ContentHandoffTask): task is ContentHandoffTask & { content_item_id: string } {
  return task.assigned_agent === "creative" && task.content_item_id !== null;
}

// A candidate must be a completed Content task for the same content item, client, and project.
// client_id and project_id must match exactly, including both being null.
export function isContentHandoffCandidate(task: ContentHandoffTask, candidate: ContentHandoffCandidate) {
  return candidate.id !== task.id
    && candidate.assigned_agent === "content"
    && candidate.status === "completed"
    && candidate.content_item_id !== null
    && candidate.content_item_id === task.content_item_id
    && candidate.client_id === task.client_id
    && candidate.project_id === task.project_id;
}

const newestFirst = (left: string | null, right: string | null) => {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return Date.parse(right) - Date.parse(left);
};

// Picks the latest eligible candidate (completed_at desc, nulls last, then created_at desc)
// and returns it only if its stored output is still a valid content_result.
export function selectContentHandoff(
  task: ContentHandoffTask,
  candidates: ContentHandoffCandidate[],
  contentResultSchema: ContentResultValidator,
): ContentHandoff | null {
  if (!shouldLookupContentHandoff(task)) return null;
  const latest = candidates
    .filter((candidate) => isContentHandoffCandidate(task, candidate))
    .sort((left, right) => newestFirst(left.completed_at, right.completed_at) || newestFirst(left.created_at, right.created_at))[0];
  if (!latest) return null;
  const parsed = contentResultSchema.safeParse(latest.structured_output);
  if (!parsed.success) return null;
  return { source_task_id: latest.id, completed_at: latest.completed_at, content_result: parsed.data };
}
