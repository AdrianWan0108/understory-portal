import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSlackMessage, type SlackWebhookTarget } from "@/lib/slack";
import {
  DIVISIONS,
  DIVISION_LABELS,
  DIVISION_TASK_STATUSES,
  DIVISION_TASK_STATUS_DETAILS,
  isDivision,
  isDivisionTaskStatus,
} from "@/lib/division-tasks";

const SLACK_TARGETS: SlackWebhookTarget[] = ["admin", "mvp", "boardwalk"];

function isSlackTarget(value: unknown): value is SlackWebhookTarget {
  return typeof value === "string" && (SLACK_TARGETS as string[]).includes(value);
}

export const PROJECT_MANAGER_TOOLS: Anthropic.Tool[] = [
  {
    name: "list_clients",
    description:
      "List Understory's clients (id, name, slug). Use this to resolve a client name mentioned in conversation " +
      "to the id/slug needed by list_projects.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_projects",
    description:
      "List live project/task rows from the Understory portal, optionally filtered. Omit client to search across " +
      "all clients. Returns division, title, status, and assignees for each matching task.",
    input_schema: {
      type: "object",
      properties: {
        client_slug: {
          type: "string",
          description: "Restrict to one client's slug (e.g. 'mvp'). Omit to search every client.",
        },
        division: {
          type: "string",
          enum: [...DIVISIONS],
          description: "Restrict to one division of work.",
        },
        status: {
          type: "string",
          enum: [...DIVISION_TASK_STATUSES],
          description: "Restrict to one task status.",
        },
        limit: {
          type: "number",
          description: "Max rows to return (default 25, max 50).",
        },
      },
    },
  },
  {
    name: "send_team_slack_message",
    description:
      "Post a message directly to the Understory team's Slack. This sends immediately and cannot be recalled — " +
      "only call it when the person you're talking to has asked for an update to go out.",
    input_schema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          enum: SLACK_TARGETS,
          description:
            "Which channel: 'admin' for general internal updates (default choice), 'mvp' or 'boardwalk' only " +
            "for updates specific to that client's work.",
        },
        message: {
          type: "string",
          description: "The exact message text to post.",
        },
      },
      required: ["target", "message"],
    },
  },
];

async function runListClients(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("clients")
    .select("id, name, slug")
    .order("name", { ascending: true });
  if (error) return `Error listing clients: ${error.message}`;
  if (!data?.length) return "No clients found.";
  return data.map((row) => `- ${row.name} (slug: ${row.slug}, id: ${row.id})`).join("\n");
}

async function runListProjects(admin: SupabaseClient, input: Record<string, unknown>) {
  const clientSlug = typeof input.client_slug === "string" ? input.client_slug : null;
  const division =
    typeof input.division === "string" && isDivision(input.division) ? input.division : null;
  const status =
    typeof input.status === "string" && isDivisionTaskStatus(input.status) ? input.status : null;
  const limit = Math.min(
    Math.max(typeof input.limit === "number" ? Math.floor(input.limit) : 25, 1),
    50,
  );

  let clientId: string | null = null;
  if (clientSlug) {
    const { data: clientRow, error: clientError } = await admin
      .from("clients")
      .select("id, name")
      .eq("slug", clientSlug)
      .maybeSingle();
    if (clientError) return `Error looking up client: ${clientError.message}`;
    if (!clientRow) return `No client found with slug '${clientSlug}'.`;
    clientId = clientRow.id;
  }

  let query = admin
    .from("division_tasks")
    .select("division, title, status, assignee_usernames, client_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (clientId) query = query.eq("client_id", clientId);
  if (division) query = query.eq("division", division);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return `Error listing projects: ${error.message}`;
  if (!data?.length) return "No matching projects/tasks.";

  const clientIds = Array.from(new Set(data.map((row) => row.client_id).filter(Boolean)));
  const clientNamesById = new Map<string, string>();
  if (clientIds.length) {
    const { data: clientRows } = await admin.from("clients").select("id, name").in("id", clientIds);
    for (const row of clientRows ?? []) clientNamesById.set(row.id, row.name);
  }

  return data
    .map((row) => {
      const clientName = clientNamesById.get(row.client_id) ?? "Unknown client";
      const divisionLabel = isDivision(row.division) ? DIVISION_LABELS[row.division] : row.division;
      const statusLabel = isDivisionTaskStatus(row.status)
        ? DIVISION_TASK_STATUS_DETAILS[row.status].label
        : row.status;
      const assignees = Array.isArray(row.assignee_usernames) && row.assignee_usernames.length
        ? ` — assigned: ${row.assignee_usernames.join(", ")}`
        : "";
      return `- [${clientName}/${divisionLabel}] ${row.title} — ${statusLabel}${assignees}`;
    })
    .join("\n");
}

async function runSendSlackMessage(input: Record<string, unknown>) {
  const target = input.target;
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!isSlackTarget(target)) return "Error: target must be one of admin, mvp, boardwalk.";
  if (!message) return "Error: message is required.";

  try {
    await sendSlackMessage(target, message);
    return `Sent to #${target}.`;
  } catch (caught) {
    return `Error sending to Slack: ${caught instanceof Error ? caught.message : "unknown error"}`;
  }
}

export async function runProjectManagerTool(
  admin: SupabaseClient,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "list_clients":
      return runListClients(admin);
    case "list_projects":
      return runListProjects(admin, input);
    case "send_team_slack_message":
      return runSendSlackMessage(input);
    default:
      return `Unknown tool: ${name}`;
  }
}
