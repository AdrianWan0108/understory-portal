import type { NextRequest } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
  getTeamIdentityForUsername,
} from "@/lib/team-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  AGENT_SYSTEM_PROMPTS,
  MAX_HISTORY_MESSAGES,
  MAX_PROJECT_TASKS,
  MAX_REPLY_TOKENS,
  MAX_TOOL_ITERATIONS,
  MODEL_ID,
  MONTHLY_BUDGET_USD,
  type AssistantAgent,
  buildClientContext,
  buildProjectContext,
  estimateCostUsd,
  getAnthropicClient,
  getMonthlySpend,
  isAssistantAgent,
  startOfCurrentMonthIso,
} from "@/lib/anthropic-assistant";
import { PROJECT_MANAGER_TOOLS, runProjectManagerTool } from "@/lib/anthropic-tools";

export const runtime = "nodejs";

type ConversationRow = {
  id: string;
  team_username: string;
  agent: string;
  client_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function callerFromRequest(request: NextRequest) {
  const identity = getTeamIdentityForUsername(
    request.cookies.get(TEAM_SESSION_COOKIE)?.value,
  );
  if (!identity) return null;
  return TEAM_IDENTITIES[identity];
}

async function getUsageSummary(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("assistant_usage")
    .select("team_username, agent, estimated_cost_usd, created_at")
    .gte("created_at", startOfCurrentMonthIso())
    .order("created_at", { ascending: false });

  if (error) return jsonError(error.message, 500);

  const rows = (data ?? []) as Array<{
    team_username: string;
    agent: string;
    estimated_cost_usd: number;
    created_at: string;
  }>;

  const byUser = new Map<string, { cost: number; messages: number }>();
  const byAgent = new Map<string, { cost: number; messages: number }>();
  let monthlySpend = 0;

  for (const row of rows) {
    const cost = Number(row.estimated_cost_usd ?? 0);
    monthlySpend += cost;

    const user = byUser.get(row.team_username) ?? { cost: 0, messages: 0 };
    user.cost += cost;
    user.messages += 1;
    byUser.set(row.team_username, user);

    const agent = byAgent.get(row.agent) ?? { cost: 0, messages: 0 };
    agent.cost += cost;
    agent.messages += 1;
    byAgent.set(row.agent, agent);
  }

  return Response.json({
    monthlySpend,
    monthlyBudget: MONTHLY_BUDGET_USD,
    byUser: Array.from(byUser.entries()).map(([teamUsername, stats]) => ({
      teamUsername,
      ...stats,
    })),
    byAgent: Array.from(byAgent.entries()).map(([agent, stats]) => ({
      agent,
      ...stats,
    })),
  });
}

export async function GET(request: NextRequest) {
  const caller = callerFromRequest(request);
  if (!caller) return jsonError("Sign in to use the assistant.", 401);

  const admin = getSupabaseAdmin();
  if (!admin) return jsonError("Assistant storage is not configured.", 500);

  if (request.nextUrl.searchParams.get("usageSummary") === "1") {
    if (caller.accessLevel !== "owner") {
      return jsonError("Owner access is required.", 403);
    }
    return getUsageSummary(admin);
  }

  let monthlySpend: number;
  try {
    monthlySpend = await getMonthlySpend(admin);
  } catch (caught) {
    return jsonError(
      caught instanceof Error ? caught.message : "Could not read usage.",
      500,
    );
  }

  const conversationId = request.nextUrl.searchParams.get("conversationId");

  if (conversationId) {
    const { data: conversation, error: conversationError } = await admin
      .from("assistant_conversations")
      .select("id, team_username, agent, client_id, title, created_at, updated_at")
      .eq("id", conversationId)
      .eq("team_username", caller.username)
      .maybeSingle();

    if (conversationError) return jsonError(conversationError.message, 500);
    if (!conversation) return jsonError("Conversation not found.", 404);

    const { data: messages, error: messagesError } = await admin
      .from("assistant_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (messagesError) return jsonError(messagesError.message, 500);

    return Response.json({
      conversation: conversation as ConversationRow,
      messages: (messages ?? []) as MessageRow[],
      monthlySpend,
      monthlyBudget: MONTHLY_BUDGET_USD,
    });
  }

  const { data: conversations, error: listError } = await admin
    .from("assistant_conversations")
    .select("id, team_username, agent, client_id, title, created_at, updated_at")
    .eq("team_username", caller.username)
    .order("updated_at", { ascending: false });

  if (listError) return jsonError(listError.message, 500);

  return Response.json({
    conversations: (conversations ?? []) as ConversationRow[],
    monthlySpend,
    monthlyBudget: MONTHLY_BUDGET_USD,
  });
}

export async function POST(request: NextRequest) {
  const caller = callerFromRequest(request);
  if (!caller) return jsonError("Sign in to use the assistant.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  if (typeof body !== "object" || body === null) {
    return jsonError("Invalid request body.", 400);
  }

  const payload = body as Record<string, unknown>;
  const agent = payload.agent;
  const message =
    typeof payload.message === "string" ? payload.message.trim() : "";
  const conversationId =
    typeof payload.conversationId === "string" ? payload.conversationId : null;
  const clientId =
    typeof payload.clientId === "string" && payload.clientId
      ? payload.clientId
      : null;

  if (!isAssistantAgent(agent)) {
    return jsonError("Choose an agent: content, research, or project_manager.", 422);
  }
  if (!message) {
    return jsonError("Message is required.", 422);
  }

  const admin = getSupabaseAdmin();
  if (!admin) return jsonError("Assistant storage is not configured.", 500);

  const anthropic = getAnthropicClient();
  if (!anthropic) {
    return jsonError(
      "The assistant is not configured yet (missing ANTHROPIC_API_KEY).",
      500,
    );
  }

  let monthlySpend: number;
  try {
    monthlySpend = await getMonthlySpend(admin);
  } catch (caught) {
    return jsonError(
      caught instanceof Error ? caught.message : "Could not read usage.",
      500,
    );
  }

  if (monthlySpend >= MONTHLY_BUDGET_USD) {
    return jsonError(
      "Monthly assistant budget reached. It resets next month.",
      402,
    );
  }

  let conversation: ConversationRow;
  if (conversationId) {
    const { data, error } = await admin
      .from("assistant_conversations")
      .select("id, team_username, agent, client_id, title, created_at, updated_at")
      .eq("id", conversationId)
      .eq("team_username", caller.username)
      .maybeSingle();
    if (error) return jsonError(error.message, 500);
    if (!data) return jsonError("Conversation not found.", 404);
    conversation = data as ConversationRow;
  } else {
    const { data, error } = await admin
      .from("assistant_conversations")
      .insert({
        team_username: caller.username,
        agent,
        client_id: clientId,
        title: message.slice(0, 60),
      })
      .select("id, team_username, agent, client_id, title, created_at, updated_at")
      .single();
    if (error || !data) {
      return jsonError(
        error?.message ?? "Could not start a conversation.",
        500,
      );
    }
    conversation = data as ConversationRow;
  }

  const { data: history, error: historyError } = await admin
    .from("assistant_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);

  if (historyError) return jsonError(historyError.message, 500);

  const priorMessages = ((history ?? []) as MessageRow[])
    .slice()
    .reverse()
    .map((row) => ({
      role: row.role as "user" | "assistant",
      content: row.content,
    }));

  let systemPrompt = AGENT_SYSTEM_PROMPTS[conversation.agent as AssistantAgent];
  const effectiveClientId = clientId ?? conversation.client_id;
  if (effectiveClientId) {
    const { data: clientRow } = await admin
      .from("clients")
      .select("id, name")
      .eq("id", effectiveClientId)
      .maybeSingle();
    const { data: profileRow } = await admin
      .from("client_profiles")
      .select(
        "industry, overview, target_audience, unique_value_prop, brand_voice, marketing_channels",
      )
      .eq("client_id", effectiveClientId)
      .maybeSingle();
    const { data: taskRows } = await admin
      .from("division_tasks")
      .select("division, title, status, template_type, content_brief_data")
      .eq("client_id", effectiveClientId)
      .order("created_at", { ascending: false })
      .limit(MAX_PROJECT_TASKS);

    if (clientRow) {
      systemPrompt += `\n\n${buildClientContext({
        client_name: clientRow.name,
        industry: profileRow?.industry ?? null,
        overview: profileRow?.overview ?? null,
        target_audience: profileRow?.target_audience ?? null,
        unique_value_prop: profileRow?.unique_value_prop ?? null,
        brand_voice: profileRow?.brand_voice ?? null,
        marketing_channels: profileRow?.marketing_channels ?? null,
      })}`;
    }
    const projectContext = buildProjectContext(taskRows ?? []);
    if (projectContext) systemPrompt += `\n\n${projectContext}`;
  }

  const tools =
    conversation.agent === "project_manager" ? PROJECT_MANAGER_TOOLS : undefined;

  let reply = "";
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const conversationMessages: Anthropic.MessageParam[] = [
      ...priorMessages,
      { role: "user", content: message },
    ];

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await anthropic.messages.create({
        model: MODEL_ID,
        max_tokens: MAX_REPLY_TOKENS,
        system: systemPrompt,
        messages: conversationMessages,
        ...(tools ? { tools } : {}),
      });
      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      const textReply = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );

      if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
        reply = textReply;
        break;
      }

      conversationMessages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = await runProjectManagerTool(
          admin,
          toolUse.name,
          (toolUse.input ?? {}) as Record<string, unknown>,
        );
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
      }
      conversationMessages.push({ role: "user", content: toolResults });
    }
  } catch (caught) {
    return jsonError(
      caught instanceof Error
        ? `Could not reach the assistant: ${caught.message}`
        : "Could not reach the assistant.",
      502,
    );
  }

  if (!reply) {
    reply = "I hit my tool-call limit for this turn — try asking again or narrow the request.";
  }

  const { error: insertUserError } = await admin
    .from("assistant_messages")
    .insert({ conversation_id: conversation.id, role: "user", content: message });
  if (insertUserError) return jsonError(insertUserError.message, 500);

  const { error: insertReplyError } = await admin
    .from("assistant_messages")
    .insert({ conversation_id: conversation.id, role: "assistant", content: reply });
  if (insertReplyError) return jsonError(insertReplyError.message, 500);

  const cost = estimateCostUsd(inputTokens, outputTokens);
  const { error: usageError } = await admin.from("assistant_usage").insert({
    team_username: caller.username,
    conversation_id: conversation.id,
    agent: conversation.agent,
    model: MODEL_ID,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: cost,
  });
  if (usageError) return jsonError(usageError.message, 500);

  await admin
    .from("assistant_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id);

  return Response.json({
    conversationId: conversation.id,
    reply,
    monthlySpend: monthlySpend + cost,
    monthlyBudget: MONTHLY_BUDGET_USD,
  });
}
