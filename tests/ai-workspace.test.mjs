import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAiTaskSchema, operationsResultSchema, structuredOutputSchema, taskEventSchema, tasksToolRequestSchema } from "../lib/ai-workspace/schemas.ts";
import { canReadAiTask, mayTransition, requiresHumanApproval } from "../lib/ai-workspace/policy.ts";
import { signAiPayload, verifyAiPayload } from "../lib/ai-workspace/signatures.ts";
import { aiSlackNotification } from "../lib/ai-workspace/slack-message.ts";
import {
  authorizeTasksToolRequest,
  TASKS_TOOL_SELECT,
} from "../lib/ai-workspace/tasks-tool.ts";
import {
  AI_WORKSPACE_CALLBACK_PATH,
  AI_WORKSPACE_PATH,
  getAiWorkspaceOAuthRecoveryPath,
  getSafeAiWorkspaceNext,
  resolveAiWorkspaceActor,
  startGithubAiWorkspaceOAuth,
} from "../lib/ai-workspace/auth.ts";

test("versioned structured outputs reject malformed or unversioned content", () => {
  const valid = { schema_version: 1, kind: "content_suggestion", title: "Launch", format: "image", purpose: "Awareness",
    hook: "Meet us", caption: "Draft", bilingual_variations: [], creative_brief: "Simple image", production_due_date: "2026-09-18",
    publication_date: "2026-09-20", source_references: [] };
  assert.equal(structuredOutputSchema.safeParse(valid).success, true);
  assert.equal(structuredOutputSchema.safeParse({ ...valid, schema_version: 2 }).success, false);
  assert.equal(structuredOutputSchema.safeParse({ ...valid, production_due_date: "tomorrow" }).success, false);
  assert.equal(createAiTaskSchema.safeParse({ agent: "content", title: "Draft", objective: "Write", idempotency_key: "a".repeat(16) }).success, true);
  assert.equal(createAiTaskSchema.safeParse({ agent: "unknown", title: "Draft", objective: "Write", idempotency_key: "a".repeat(16) }).success, false);
});

test("n8n events require stable IDs and validated output", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const event = { schema_version: 1, event_id: id, task_id: id, run_id: id, correlation_id: id, idempotency_key: "idempotent-event-1",
    trigger_source: "webhook", status: "completed", summary: "Done", output: { schema_version: 1, kind: "approval_request", risk_level: "high",
      action_type: "schedule_content", requested_action: "Schedule content", downstream_action: "Queue approved schedule", output_preview: "Preview" } };
  assert.equal(taskEventSchema.safeParse(event).success, true);
  assert.equal(taskEventSchema.safeParse({ ...event, event_id: "nope" }).success, false);
  assert.equal(taskEventSchema.safeParse({ ...event, output: { ...event.output, schema_version: 99 } }).success, false);
  assert.equal(taskEventSchema.safeParse({ ...event, output: { ...event.output, action_type: "unlisted_action" } }).success, false);
});

test("operations results validate directly and in completed n8n events", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const output = {
    schema_version: 1,
    kind: "operations_result",
    summary: "The launch plan is feasible with one scheduling dependency.",
    recommended_actions: [{
      title: "Confirm the production date",
      rationale: "The publication sequence depends on asset delivery.",
      priority: "high",
      approval_required: false,
    }],
    risks: [{ description: "Late assets could compress review time.", severity: "medium" }],
    questions: ["Who owns the final asset review?"],
  };
  const event = {
    schema_version: 1,
    event_id: id,
    task_id: id,
    run_id: id,
    correlation_id: id,
    idempotency_key: "operations-event-1",
    trigger_source: "webhook",
    status: "completed",
    summary: "Operational analysis completed.",
    output,
  };

  assert.equal(operationsResultSchema.safeParse(output).success, true);
  assert.equal(structuredOutputSchema.safeParse(output).success, true);
  assert.equal(taskEventSchema.safeParse(event).success, true);
});

test("operations results reject invalid required fields and action values", () => {
  const valid = {
    schema_version: 1,
    kind: "operations_result",
    summary: "Operations review complete.",
    recommended_actions: [{ title: "Proceed", rationale: "Dependencies are ready.", priority: "normal", approval_required: false }],
    risks: [],
    questions: [],
  };

  assert.equal(structuredOutputSchema.safeParse({
    ...valid,
    recommended_actions: [{ ...valid.recommended_actions[0], priority: "critical" }],
  }).success, false);
  const { summary: _summary, ...missingSummary } = valid;
  assert.equal(structuredOutputSchema.safeParse(missingSummary).success, false);
  assert.equal(structuredOutputSchema.safeParse({
    ...valid,
    recommended_actions: [{ ...valid.recommended_actions[0], approval_required: "false" }],
  }).success, false);
});

test("existing structured output kinds continue to validate", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const outputs = [
    { schema_version: 1, kind: "project_task", title: "Plan", description: "Plan the launch", owner: null, due_date: null,
      priority: "normal", source_references: [], scope_risk: null },
    { schema_version: 1, kind: "content_suggestion", title: "Launch", format: "image", purpose: "Awareness", hook: "Meet us",
      caption: "Draft", bilingual_variations: [], creative_brief: "Simple image", production_due_date: null, publication_date: null, source_references: [] },
    { schema_version: 1, kind: "research_result", question: "What changed?", summary: "Demand increased.", findings: [], sources: [],
      uncertainty: "Limited sample", opportunities: [] },
    { schema_version: 1, kind: "creative_brief", concept: "Launch", objective: "Build awareness", audience: "Customers", hierarchy: [],
      asset_requirements: [], accessibility_notes: [], image_prompts: [], figma_file_url: null, figma_frame_url: null, delivery_status: "concept_only" },
    { schema_version: 1, kind: "analytics_insight", metric_period: { start: "2026-09-01", end: "2026-09-30" }, metric_references: [],
      interpretation: "Engagement increased.", limitations: [], recommended_actions: [], external_context: [] },
    { schema_version: 1, kind: "slack_response", task_id: id, channel_id: "channel", thread_ts: null, summary: "Done",
      portal_deep_link: "/team-hub/ai-workspace/tasks/task-1", status: "completed" },
    { schema_version: 1, kind: "approval_request", risk_level: "high", action_type: "schedule_content", requested_action: "Schedule content",
      downstream_action: "Queue approved schedule", output_preview: "Preview" },
  ];

  for (const output of outputs) assert.equal(structuredOutputSchema.safeParse(output).success, true, output.kind);
});

test("signed n8n payloads reject tampering, stale timestamps, and wrong secrets", () => {
  const secret = "a-long-shared-secret-with-more-than-32-bytes";
  const timestamp = "1789592400";
  const body = '{"task_id":"one"}';
  const signature = signAiPayload(secret, timestamp, body);
  const input = { secret, timestamp, signature, body, now: 1789592400000 };
  assert.equal(verifyAiPayload(input), true);
  assert.equal(verifyAiPayload({ ...input, body: '{"task_id":"two"}' }), false);
  assert.equal(verifyAiPayload({ ...input, secret: "wrong" }), false);
  assert.equal(verifyAiPayload({ ...input, now: 1789593000000 }), false);
});

test("signed tasks tool requests validate their versioned read filters", () => {
  const secret = "a-long-shared-secret-with-more-than-32-bytes";
  const timestamp = "1789592400";
  const taskId = "00000000-0000-4000-8000-000000000001";
  const runId = "00000000-0000-4000-8000-000000000002";
  const body = JSON.stringify({
    schema_version: 1,
    task_id: taskId,
    run_id: runId,
    filters: { client_id: null, due_before: "2026-09-30" },
  });
  const signature = signAiPayload(secret, timestamp, body);

  assert.equal(verifyAiPayload({ secret, timestamp, signature, body, now: 1789592400000 }), true);
  const parsed = tasksToolRequestSchema.safeParse(JSON.parse(body));
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.filters.limit, 50);
  assert.equal(tasksToolRequestSchema.safeParse({ schema_version: 1, task_id: taskId, run_id: "invalid", filters: {} }).success, false);
  assert.equal(tasksToolRequestSchema.safeParse({ schema_version: 1, task_id: taskId, run_id: runId, filters: { limit: 101 } }).success, false);
});

test("tasks tool authorization rejects run mismatches, disabled tools, and conflicting scopes", () => {
  const taskId = "00000000-0000-4000-8000-000000000001";
  const otherTaskId = "00000000-0000-4000-8000-000000000002";
  const clientId = "00000000-0000-4000-8000-000000000003";
  const otherClientId = "00000000-0000-4000-8000-000000000004";
  const projectId = "00000000-0000-4000-8000-000000000005";
  const otherProjectId = "00000000-0000-4000-8000-000000000006";
  const request = tasksToolRequestSchema.parse({ schema_version: 1, task_id: taskId, run_id: otherTaskId, filters: {} });
  const task = { id: taskId, assigned_agent: "operations", client_id: clientId, project_id: projectId };
  const config = { allowed_tools: ["tasks"], permitted_client_ids: [clientId], permitted_project_ids: [projectId] };

  assert.deepEqual(authorizeTasksToolRequest({ request, run: { task_id: otherTaskId }, task, config }), {
    ok: false,
    reason: "task_or_run_not_found",
  });
  assert.deepEqual(authorizeTasksToolRequest({ request, run: { task_id: taskId }, task,
    config: { ...config, allowed_tools: ["projects"] } }), { ok: false, reason: "tool_not_allowed" });
  assert.deepEqual(authorizeTasksToolRequest({ request: { ...request, filters: { ...request.filters, client_id: otherClientId } },
    run: { task_id: taskId }, task, config }), { ok: false, reason: "client_scope_conflict" });
  assert.deepEqual(authorizeTasksToolRequest({ request: { ...request, filters: { ...request.filters, project_id: otherProjectId } },
    run: { task_id: taskId }, task, config }), { ok: false, reason: "project_scope_conflict" });
});

test("tasks tool exposes only the approved operational task fields", () => {
  assert.deepEqual(TASKS_TOOL_SELECT.split(", "), [
    "id", "client_id", "division_task_id", "title", "description", "status", "production_status", "publishing_status",
    "due_date", "scheduled_at", "platform", "format", "assignee_usernames", "watcher_usernames", "mentioned_usernames", "created_at",
  ]);
});

test("task access and transitions enforce owner, staff, contractor, and client boundaries", () => {
  const task = { requested_by: "requester", assigned_profile_id: "assignee", project_id: "project", content_item_id: null };
  assert.equal(canReadAiTask({ role: "owner", profileId: "other", teamUsername: null, task }), true);
  assert.equal(canReadAiTask({ role: "staff", profileId: "other", teamUsername: "Understory_Arion", task,
    projectAccess: { watcher_usernames: ["Understory_Arion"] } }), true);
  assert.equal(canReadAiTask({ role: "contractor", profileId: "other", teamUsername: "Understory_Arion", task,
    projectAccess: { watcher_usernames: ["Understory_Arion"] } }), false);
  assert.equal(canReadAiTask({ role: "contractor", profileId: "assignee", teamUsername: null, task }), true);
  assert.equal(canReadAiTask({ role: "contractor", profileId: "requester", teamUsername: null, task }), false);
  assert.equal(canReadAiTask({ role: "client", profileId: "requester", teamUsername: null, task }), false);
  assert.equal(mayTransition("queued", "running"), true);
  assert.equal(mayTransition("completed", "running"), false);
  assert.equal(requiresHumanApproval("publish_content", "low"), true);
  assert.equal(requiresHumanApproval("draft_caption", "high"), true);
});

test("Slack notification includes the exact portal link and escapes labels", () => {
  const message = aiSlackNotification({ client: "A&B", title: "Launch <draft>", agent: "Content", status: "Queued",
    requester: "Karen", date: "2026-09-16", summary: "Draft for review", url: "https://portal.example.com/team-hub/ai-workspace/tasks/one" });
  assert.match(message, /A&amp;B/);
  assert.match(message, /Launch &lt;draft&gt;/);
  assert.match(message, /https:\/\/portal\.example\.com\/team-hub\/ai-workspace\/tasks\/one/);
});

test("migration makes event IDs and task request keys unique and AI tables server only", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260916000000_add_ai_workspace.sql", import.meta.url), "utf8");
  assert.match(sql, /idempotency_key text not null unique/g);
  assert.match(sql, /event_key text not null unique/);
  assert.match(sql, /idempotency_key text unique/);
  assert.match(sql, /revoke all on public\.ai_agents[\s\S]*from anon, authenticated/);
  assert.match(sql, /ai_task_events_immutable/);
  assert.match(sql, /create function public\.ai_create_task/);
  assert.match(sql, /create function public\.ai_apply_task_event/);
  assert.match(sql, /create function public\.ai_decide_approval/);
});

test("GitHub OAuth starts with the fixed AI Workspace callback", async () => {
  let request;
  const result = await startGithubAiWorkspaceOAuth(async (input) => {
    request = input;
    return { error: null };
  }, "https://portal.example.com");
  assert.equal(result.error, null);
  assert.deepEqual(request, {
    provider: "github",
    options: { redirectTo: `https://portal.example.com${AI_WORKSPACE_CALLBACK_PATH}` },
  });
});

test("authorized OAuth sessions resolve through the existing AI identity endpoint", async () => {
  let authorization;
  const result = await resolveAiWorkspaceActor("access-token", async (path, init) => {
    authorization = init.headers.Authorization;
    assert.equal(path, "/api/ai/me");
    return { ok: true, status: 200, async json() { return { actor: { id: "profile", userId: "user", role: "owner", teamUsername: "adrian", fullName: "Adrian" } }; } };
  });
  assert.equal(authorization, "Bearer access-token");
  assert.equal(result.status, "authorized");
  assert.equal(result.actor.role, "owner");
});

test("authenticated sessions without a linked profile are denied", async () => {
  const result = await resolveAiWorkspaceActor("access-token", async () => ({
    ok: false, status: 401, async json() { return { error: "Not linked" }; },
  }));
  assert.deepEqual(result, { status: "unauthorized" });
});

test("email password fallback and existing-session checks remain in the workspace", async () => {
  const workspace = await readFile(new URL("../app/team-hub/ai-workspace/_components/Workspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /auth\.signInWithPassword/);
  assert.match(workspace, /auth\.getSession\(\)/);
  assert.match(workspace, /Continue with GitHub/);
  assert.match(workspace, />or</);
});

test("OAuth callback rejects external and callback-loop next destinations", () => {
  assert.equal(getSafeAiWorkspaceNext("https://evil.example/steal"), AI_WORKSPACE_PATH);
  assert.equal(getSafeAiWorkspaceNext("//evil.example/steal"), AI_WORKSPACE_PATH);
  assert.equal(getSafeAiWorkspaceNext(`${AI_WORKSPACE_CALLBACK_PATH}?next=loop`), AI_WORKSPACE_PATH);
  assert.equal(getSafeAiWorkspaceNext(`${AI_WORKSPACE_PATH}/tasks/task-1?tab=activity`), `${AI_WORKSPACE_PATH}/tasks/task-1?tab=activity`);
});

test("site URL fallback recovers AI Workspace OAuth results across origins", async () => {
  const oauthHash = "#access_token=test-token&refresh_token=refresh-token&expires_in=3600";
  assert.equal(getAiWorkspaceOAuthRecoveryPath({ hasPendingAiOAuth: true, search: "", hash: oauthHash }), `${AI_WORKSPACE_CALLBACK_PATH}${oauthHash}`);
  assert.equal(getAiWorkspaceOAuthRecoveryPath({ hasPendingAiOAuth: false, search: "", hash: oauthHash }), `${AI_WORKSPACE_CALLBACK_PATH}${oauthHash}`);
  assert.equal(getAiWorkspaceOAuthRecoveryPath({ hasPendingAiOAuth: false, search: "?error=access_denied&error_description=Denied", hash: "" }), `${AI_WORKSPACE_CALLBACK_PATH}?error=access_denied&error_description=Denied`);
  assert.equal(getAiWorkspaceOAuthRecoveryPath({ hasPendingAiOAuth: false, search: "", hash: "#access_token=incomplete" }), null);
  assert.equal(getAiWorkspaceOAuthRecoveryPath({ hasPendingAiOAuth: true, search: "", hash: "#error=access_denied&error_description=Denied" }), `${AI_WORKSPACE_CALLBACK_PATH}#error=access_denied&error_description=Denied`);
  assert.equal(getAiWorkspaceOAuthRecoveryPath({ hasPendingAiOAuth: true, search: "", hash: "" }), null);

  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(home, /sessionStorage\.getItem\(AI_WORKSPACE_NEXT_STORAGE_KEY\)/);
  assert.match(home, /window\.location\.replace\(recoveryPath \?\? "\/client-portal\/approvals"\)/);
});

test("AI identity endpoint still verifies the bearer user and linked profile role", async () => {
  const endpoint = await readFile(new URL("../lib/ai-workspace/server.ts", import.meta.url), "utf8");
  assert.match(endpoint, /admin\.auth\.getUser\(match\[1\]\)/);
  assert.match(endpoint, /\.eq\("user_id", auth\.user\.id\)/);
  assert.match(endpoint, /\["owner", "staff", "contractor"\]\.includes\(profile\.role\)/);
});
