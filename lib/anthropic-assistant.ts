import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DIVISION_LABELS,
  DIVISION_TASK_STATUS_DETAILS,
  isDivision,
  isDivisionTaskStatus,
  normalizeContentBriefData,
} from "@/lib/division-tasks";

export type AssistantAgent = "content" | "research" | "project_manager";

export function isAssistantAgent(value: unknown): value is AssistantAgent {
  return value === "content" || value === "research" || value === "project_manager";
}

// Cheapest current tier — deliberate choice for a hard-capped, predictable
// budget. Update PRICING alongside MODEL_ID if the model tier ever changes.
export const MODEL_ID = "claude-haiku-4-5";
export const PRICING = { input: 1, output: 5 }; // USD per million tokens
export const MONTHLY_BUDGET_USD = 20;
export const MAX_REPLY_TOKENS = 1024;
export const MAX_HISTORY_MESSAGES = 20;
export const MAX_PROJECT_TASKS = 30;
// Caps the tool-call/tool-result round trips per message so a confused loop
// can't spin (and can't quietly blow through the monthly budget in one turn).
export const MAX_TOOL_ITERATIONS = 4;

export const AGENT_SYSTEM_PROMPTS: Record<AssistantAgent, string> = {
  content:
    "You are a marketing copywriter for Understory, a small marketing agency, helping write content for its clients. " +
    "Write in the client's brand voice when one is given below. Produce tight, ready-to-use output — social captions, " +
    "ad copy, brief drafts — not lengthy explanations. Ask a clarifying question only if the request is genuinely ambiguous. " +
    "If a client's current projects/tasks list is given below, treat it as accurate and up to date — use it directly to " +
    "answer status questions instead of saying you lack access.",
  research:
    "You are a research assistant for Understory, a small marketing agency. Synthesize what you're told about a client " +
    "below plus your own general knowledge into clear, actionable findings for the team. You do not have live internet " +
    "access — say so plainly if asked for something time-sensitive you can't know, rather than guessing. " +
    "If a client's current projects/tasks list is given below, treat it as accurate and up to date — use it directly to " +
    "answer status questions instead of saying you lack access.",
  project_manager:
    "You are the Project Manager for Understory, a small marketing agency. Your job is to help the team run its " +
    "projects: track status across clients, flag what's overdue or stuck, and keep people in the loop. " +
    "You have tools to read live project/task data from the Understory portal (list_clients, list_projects) — use " +
    "them instead of guessing or relying only on the digest pasted below, especially for anything cross-client. " +
    "You also have a tool to post directly to the team's Slack (send_team_slack_message) to one of three channels: " +
    "'admin' (internal team channel — the default for general updates), 'mvp', or 'boardwalk' (per-client channels — " +
    "only use these when the update is specifically about that client's work). Sending is real and immediate: state " +
    "the exact message and target channel in your reply before or as you send it, so there's a record of what went " +
    "out and why. Don't send Slack messages unprompted — only when the person you're talking to has asked for an " +
    "update to go out. If a client's current projects/tasks list is given below, you may still use it, but prefer " +
    "the live tools when the question spans more than one client or needs a current status.",
};

type ClientProfileDigest = {
  client_name: string;
  industry: string | null;
  overview: string | null;
  target_audience: string | null;
  unique_value_prop: string | null;
  brand_voice: string | null;
  marketing_channels: string | null;
};

export function buildClientContext(profile: ClientProfileDigest): string {
  const lines = [`Client: ${profile.client_name}`];
  if (profile.industry) lines.push(`Industry: ${profile.industry}`);
  if (profile.overview) lines.push(`Overview: ${profile.overview}`);
  if (profile.target_audience) {
    lines.push(`Target audience: ${profile.target_audience}`);
  }
  if (profile.unique_value_prop) {
    lines.push(`Unique value proposition: ${profile.unique_value_prop}`);
  }
  if (profile.brand_voice) lines.push(`Brand voice: ${profile.brand_voice}`);
  if (profile.marketing_channels) {
    lines.push(`Marketing channels in use: ${profile.marketing_channels}`);
  }
  return lines.join("\n");
}

type ProjectTaskDigest = {
  division: string;
  title: string;
  status: string;
  template_type: string;
  content_brief_data: unknown;
};

export function buildProjectContext(tasks: ProjectTaskDigest[]): string {
  if (!tasks.length) return "";

  const lines = tasks.map((task) => {
    const divisionLabel = isDivision(task.division)
      ? DIVISION_LABELS[task.division]
      : task.division;
    const statusLabel = isDivisionTaskStatus(task.status)
      ? DIVISION_TASK_STATUS_DETAILS[task.status].label
      : task.status;
    const dueDate =
      task.template_type === "content_brief"
        ? normalizeContentBriefData(task.content_brief_data).due_date
        : "";
    return `- [${divisionLabel}] ${task.title} — ${statusLabel}${
      dueDate ? ` (due ${dueDate})` : ""
    }`;
  });

  return `Current projects/tasks for this client:\n${lines.join("\n")}`;
}

export function estimateCostUsd(inputTokens: number, outputTokens: number) {
  return (
    (inputTokens / 1_000_000) * PRICING.input +
    (outputTokens / 1_000_000) * PRICING.output
  );
}

export function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

export function startOfCurrentMonthIso() {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  return startOfMonth.toISOString();
}

export async function getMonthlySpend(
  admin: SupabaseClient,
): Promise<number> {
  const { data, error } = await admin
    .from("assistant_usage")
    .select("estimated_cost_usd")
    .gte("created_at", startOfCurrentMonthIso());

  if (error) throw new Error(error.message);

  return (data ?? []).reduce(
    (sum, row) => sum + Number(row.estimated_cost_usd ?? 0),
    0,
  );
}
