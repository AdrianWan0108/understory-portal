import type { WorkspaceClientSlug } from "@/lib/workspace-clients";

export function claimSocialTransitionKey(
  seenKeys: Set<string>,
  transitionKey: string,
) {
  if (seenKeys.has(transitionKey)) return false;
  seenKeys.add(transitionKey);
  return true;
}

export type SlackNotification =
  | {
      type: "client_review";
      clientSlug: "mvp" | "boardwalk";
      action: "approved" | "requested_changes";
      title: string;
      reviewerName: string;
      comment?: string;
      assigneeNames?: string[];
      taskId?: string;
      calendarId?: string | null;
      scheduledAt?: string | null;
      transitionKey?: string;
    }
  | {
      type: "task_review";
      clientSlug: WorkspaceClientSlug;
      title: string;
      taskId?: string;
      calendarId?: string | null;
      assigneeNames?: string[];
      scheduledAt?: string | null;
      transitionKey?: string;
    }
  | {
      type: "social_transition";
      clientSlug: WorkspaceClientSlug;
      action:
        | "internal_changes_requested"
        | "sent_to_client"
        | "publishing_date_changed"
        | "scheduled"
        | "manual_reminder_scheduled"
        | "posted";
      taskId: string;
      calendarId: string;
      transitionKey: string;
      title: string;
      assigneeNames?: string[];
      scheduledAt?: string | null;
      comment?: string;
    }
  | {
      type: "client_invoice";
      clientSlug: WorkspaceClientSlug;
      invoiceName: string;
      amount: number;
    }
  | {
      type: "payroll_invoice";
      staffUsername: string;
      amount: number;
    };

export async function sendSlackNotification(
  notification: SlackNotification,
) {
  try {
    const response = await fetch("/api/slack", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(notification),
      keepalive: true,
    });

    if (!response.ok) {
      throw new Error(
        `Slack notification endpoint returned ${response.status}.`,
      );
    }
  } catch (error) {
    console.error("Slack notification failed:", error);
  }
}
