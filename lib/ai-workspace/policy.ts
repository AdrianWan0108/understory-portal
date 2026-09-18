import type { AiTaskStatus } from "./schemas";

const transitions: Record<AiTaskStatus, readonly AiTaskStatus[]> = {
  queued: ["running", "waiting_for_input", "failed", "cancelled"],
  running: ["waiting_for_input", "waiting_for_approval", "completed", "failed", "cancelled"],
  waiting_for_input: ["queued", "running", "cancelled"],
  waiting_for_approval: ["queued", "running", "completed", "failed", "cancelled"],
  completed: [],
  failed: ["queued", "cancelled"],
  cancelled: [],
};

export function mayTransition(from: AiTaskStatus, to: AiTaskStatus) {
  return from === to || transitions[from].includes(to);
}

export const HIGH_RISK_ACTIONS = new Set([
  "client_message", "publish_content", "schedule_content", "promise_deadline", "accept_scope", "change_sow",
  "change_ad_budget", "change_ad_targeting", "change_ad_keyword", "change_ad_creative", "change_ad_campaign", "change_conversion_settings",
  "delete_record", "delete_file", "create_invoice", "create_vendor_bill", "create_payment", "create_refund", "financial_adjustment", "final_client_report",
]);

export function requiresHumanApproval(action: string, risk: "low" | "medium" | "high") {
  return risk === "high" || HIGH_RISK_ACTIONS.has(action);
}

export function canReadAiTask(input: { role: string | null; profileId: string; teamUsername: string | null; task: {
  requested_by: string; assigned_profile_id: string | null; project_id: string | null; content_item_id: string | null;
}; projectAccess?: { assignee_usernames?: string[]; watcher_usernames?: string[]; mentioned_usernames?: string[] } | null;
contentAccess?: { assignee_usernames?: string[]; watcher_usernames?: string[]; mentioned_usernames?: string[] } | null }) {
  if (input.role === "owner") return true;
  if (input.role !== "staff" && input.role !== "contractor") return false;
  if (input.role === "contractor") return input.task.assigned_profile_id === input.profileId;
  if (input.task.requested_by === input.profileId || input.task.assigned_profile_id === input.profileId) return true;
  if (!input.teamUsername) return false;
  const username = input.teamUsername;
  return [input.projectAccess, input.contentAccess].some((record) =>
    record && [record.assignee_usernames, record.watcher_usernames, record.mentioned_usernames].some((names) => names?.includes(username)),
  );
}
