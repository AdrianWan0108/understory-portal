import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  contentResultSchema,
  createAiTaskSchema,
  operationsResultSchema,
  projectsToolDivisionSchema,
  projectsToolRequestSchema,
  projectsToolStatusSchema,
  structuredOutputSchema,
  taskEventSchema,
  tasksToolProductionStatusSchema,
  tasksToolPublishingStatusSchema,
  tasksToolRequestSchema,
  tasksToolTaskStatusSchema,
} from "../lib/ai-workspace/schemas.ts";
import { SOCIAL_POST_STATUSES, SOCIAL_PRODUCTION_STATUSES, SOCIAL_PUBLISHING_STATUSES } from "../lib/social-content.ts";
import { canReadAiTask, mayTransition, requiresHumanApproval } from "../lib/ai-workspace/policy.ts";
import { signAiPayload, verifyAiPayload } from "../lib/ai-workspace/signatures.ts";
import { aiSlackNotification } from "../lib/ai-workspace/slack-message.ts";
import {
  authorizeTasksToolRequest,
  TASKS_TOOL_SELECT,
} from "../lib/ai-workspace/tasks-tool.ts";
import {
  authorizeProjectsToolRequest,
  PROJECTS_TOOL_SELECT,
  PROJECTS_TOOL_VISIBILITY_FILTER,
  projectsToolFilters,
} from "../lib/ai-workspace/projects-tool.ts";
import { selectContentHandoff, shouldLookupContentHandoff } from "../lib/ai-workspace/content-handoff.ts";
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

const contentResult = {
  schema_version: 1,
  kind: "content_result",
  hook: "Three things we changed before launch day.",
  caption: "A behind-the-scenes look at our launch prep.",
  cta: "Save this for your next launch.",
  hashtags: ["#launch", "#behindthescenes"],
  cover_headline: "Launch prep, unfiltered",
  cover_subheadline: null,
  visual_direction: "Warm natural light, handheld, close crops on hands and tools.",
  reel_cover_brief: {
    concept: "Mid-action studio moment",
    subject: null,
    composition: "Subject left third, negative space right for text",
    background: "Soft neutral studio wall",
    text_placement: "Right third, vertically centred",
    asset_requirements: ["1080x1920 still", "Brand serif font"],
  },
  notes: ["Confirm product naming with the client."],
  requires_human_review: true,
};
const contentEvent = {
  schema_version: 1,
  event_id: "00000000-0000-4000-8000-000000000011",
  task_id: "00000000-0000-4000-8000-000000000012",
  run_id: "00000000-0000-4000-8000-000000000013",
  correlation_id: "00000000-0000-4000-8000-000000000014",
  idempotency_key: "content-event-000001",
  trigger_source: "webhook",
  status: "completed",
  summary: "Content draft generated for review.",
  output: contentResult,
};

test("content results validate directly and in completed n8n events", () => {
  assert.equal(contentResultSchema.safeParse(contentResult).success, true);
  assert.equal(structuredOutputSchema.safeParse(contentResult).success, true);
  assert.equal(taskEventSchema.safeParse(contentEvent).success, true);
  assert.equal(structuredOutputSchema.safeParse({ ...contentResult, cover_subheadline: "Subheadline",
    reel_cover_brief: { ...contentResult.reel_cover_brief, subject: "Founder" }, hashtags: [], notes: [] }).success, true);
});

test("content results reject malformed fields, unknown keys, and optional human review", () => {
  const invalid = (output) => structuredOutputSchema.safeParse(output).success === false
    && taskEventSchema.safeParse({ ...contentEvent, output }).success === false;
  const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));

  assert.equal(invalid({ ...contentResult, requires_human_review: false }), true);
  assert.equal(invalid({ ...contentResult, requires_human_review: "true" }), true);
  assert.equal(invalid(without(contentResult, "requires_human_review")), true);
  assert.equal(invalid({ ...contentResult, schema_version: 2 }), true);
  assert.equal(invalid(without(contentResult, "hook")), true);
  assert.equal(invalid({ ...contentResult, caption: null }), true);
  assert.equal(invalid({ ...contentResult, hashtags: "#launch" }), true);
  assert.equal(invalid({ ...contentResult, hashtags: [1] }), true);
  assert.equal(invalid({ ...contentResult, cover_subheadline: undefined }), true);
  assert.equal(invalid({ ...contentResult, notes: null }), true);
  assert.equal(invalid({ ...contentResult, reel_cover_brief: null }), true);
  assert.equal(invalid({ ...contentResult, reel_cover_brief: without(contentResult.reel_cover_brief, "subject") }), true);
  assert.equal(invalid({ ...contentResult, reel_cover_brief: { ...contentResult.reel_cover_brief, asset_requirements: "photo" } }), true);
  assert.equal(invalid({ ...contentResult, reel_cover_brief: { ...contentResult.reel_cover_brief, extra: "x" } }), true);
  assert.equal(invalid({ ...contentResult, scheduled_at: "2026-10-01T10:00:00Z" }), true);
});

test("unknown structured output kinds are rejected", () => {
  assert.equal(structuredOutputSchema.safeParse({ ...contentResult, kind: "content_results" }).success, false);
  assert.equal(structuredOutputSchema.safeParse({ ...contentResult, kind: "publish_result" }).success, false);
  assert.equal(taskEventSchema.safeParse({ ...contentEvent, output: { schema_version: 1, kind: "arbitrary", anything: true } }).success, false);
  assert.equal(taskEventSchema.safeParse({ ...contentEvent, output: { schema_version: 1 } }).success, false);
});

test("completed content events persist the content result through the existing event path", async () => {
  // The route passes the parsed event to ai_apply_task_event unchanged, so parsing must not drop fields.
  const parsed = taskEventSchema.parse(contentEvent);
  assert.deepEqual(parsed.output, contentResult);

  const route = await readFile(new URL("../app/api/integrations/n8n/task-events/route.ts", import.meta.url), "utf8");
  assert.match(route, /taskEventSchema\.safeParse\(payload\)/);
  assert.match(route, /rpc\("ai_apply_task_event", \{ p_event: event \}\)/);

  // The SQL function stores output verbatim (JSONB) with no kind allow-list.
  const sql = await readFile(new URL("../supabase/migrations/20260916000000_add_ai_workspace.sql", import.meta.url), "utf8");
  assert.match(sql, /v_output jsonb := p_event -> 'output';/);
  assert.match(sql, /jsonb_build_object\('stage', p_event -> 'stage', 'output', v_output,/);
  assert.match(sql, /structured_output = case when v_output is not null then v_output else structured_output end/);
  assert.match(sql, /output_schema = case when v_output is not null then v_output ->> 'kind' else output_schema end/);
  assert.match(sql, /output_schema text,/);
});

const handoffIds = {
  creative: "00000000-0000-4000-8000-000000000021",
  content: "00000000-0000-4000-8000-000000000022",
  olderContent: "00000000-0000-4000-8000-000000000023",
  client: "00000000-0000-4000-8000-000000000024",
  otherClient: "00000000-0000-4000-8000-000000000025",
  project: "00000000-0000-4000-8000-000000000026",
  otherProject: "00000000-0000-4000-8000-000000000027",
  item: "00000000-0000-4000-8000-000000000028",
  otherItem: "00000000-0000-4000-8000-000000000029",
};
const creativeTask = { id: handoffIds.creative, assigned_agent: "creative", client_id: handoffIds.client, project_id: handoffIds.project, content_item_id: handoffIds.item };
const contentCandidate = (overrides = {}) => ({
  id: handoffIds.content, assigned_agent: "content", status: "completed", client_id: handoffIds.client, project_id: handoffIds.project,
  content_item_id: handoffIds.item, structured_output: contentResult, completed_at: "2026-09-20T10:00:00.000Z", created_at: "2026-09-20T09:00:00.000Z",
  ...overrides,
});
const handoff = (task, candidates) => selectContentHandoff(task, candidates, contentResultSchema);

test("creative tasks receive the completed content result for the same content item", () => {
  assert.deepEqual(handoff(creativeTask, [contentCandidate()]), {
    source_task_id: handoffIds.content,
    completed_at: "2026-09-20T10:00:00.000Z",
    content_result: contentResult,
  });
  const unscoped = { ...creativeTask, client_id: null, project_id: null };
  assert.equal(handoff(unscoped, [contentCandidate({ client_id: null, project_id: null })]).source_task_id, handoffIds.content);
});

test("content handoff returns the latest completed content result", () => {
  const older = contentCandidate({ id: handoffIds.olderContent, completed_at: "2026-09-18T10:00:00.000Z",
    structured_output: { ...contentResult, hook: "Older hook" } });
  const newer = contentCandidate({ completed_at: "2026-09-21T10:00:00.000Z" });
  assert.equal(handoff(creativeTask, [older, newer]).source_task_id, handoffIds.content);
  assert.equal(handoff(creativeTask, [newer, older]).source_task_id, handoffIds.content);

  // created_at breaks completed_at ties; a missing completed_at sorts last.
  const tieOlder = contentCandidate({ id: handoffIds.olderContent, created_at: "2026-09-19T09:00:00.000Z" });
  assert.equal(handoff(creativeTask, [tieOlder, contentCandidate()]).source_task_id, handoffIds.content);
  const undated = contentCandidate({ completed_at: null, created_at: "2026-09-30T09:00:00.000Z" });
  assert.equal(handoff(creativeTask, [undated, older]).source_task_id, handoffIds.olderContent);
});

test("content handoff ignores other content items, scopes, agents, statuses, and the task itself", () => {
  assert.equal(handoff(creativeTask, [contentCandidate({ content_item_id: handoffIds.otherItem })]), null);
  assert.equal(handoff(creativeTask, [contentCandidate({ content_item_id: null })]), null);
  assert.equal(handoff(creativeTask, [contentCandidate({ client_id: handoffIds.otherClient })]), null);
  assert.equal(handoff(creativeTask, [contentCandidate({ project_id: handoffIds.otherProject })]), null);
  assert.equal(handoff(creativeTask, [contentCandidate({ client_id: null })]), null);
  assert.equal(handoff(creativeTask, [contentCandidate({ project_id: null })]), null);
  assert.equal(handoff({ ...creativeTask, client_id: null }, [contentCandidate()]), null);
  assert.equal(handoff(creativeTask, [contentCandidate({ assigned_agent: "operations" })]), null);
  assert.equal(handoff(creativeTask, [contentCandidate({ status: "waiting_for_approval" })]), null);
  assert.equal(handoff(creativeTask, [contentCandidate({ id: handoffIds.creative })]), null);
});

test("content handoff is null for wrong-kind or malformed stored output", () => {
  assert.equal(handoff(creativeTask, [contentCandidate({ structured_output: null })]), null);
  assert.equal(handoff(creativeTask, [contentCandidate({ structured_output: { ...contentResult, kind: "content_suggestion" } })]), null);
  assert.equal(handoff(creativeTask, [contentCandidate({ structured_output: { ...contentResult, requires_human_review: false } })]), null);
  assert.equal(handoff(creativeTask, [contentCandidate({ structured_output: { ...contentResult, hashtags: "#launch" } })]), null);
  assert.equal(handoff(creativeTask, [contentCandidate({ structured_output: { ...contentResult, injected: "x" } })]), null);
});

test("content handoff only applies to creative tasks with a content item", () => {
  assert.equal(shouldLookupContentHandoff(creativeTask), true);
  assert.equal(shouldLookupContentHandoff({ ...creativeTask, content_item_id: null }), false);
  assert.equal(handoff({ ...creativeTask, content_item_id: null }, [contentCandidate({ content_item_id: null })]), null);
  for (const agent of ["content", "operations", "research", "growth"]) {
    assert.equal(shouldLookupContentHandoff({ ...creativeTask, assigned_agent: agent }), false);
    assert.equal(handoff({ ...creativeTask, assigned_agent: agent }, [contentCandidate()]), null);
  }
});

test("context endpoint keeps its existing fields and adds a scoped content handoff", async () => {
  const route = await readFile(new URL("../app/api/ai/tasks/[taskId]/context/route.ts", import.meta.url), "utf8");
  assert.match(route, /body: `GET:\$\{taskId\}:\$\{runId\}`/);
  assert.match(route, /from\("ai_task_runs"\)\.select\("id, task_id"\)\.eq\("id", runId\)\.eq\("task_id", taskId\)/);
  assert.match(route, /return Response\.json\(\{ schema_version: 1, task, run_id: runId, client: client\?\.data \?\? null, project: project\?\.data \?\? null,\s*content_item: content\?\.data \?\? null, client_profile: profile\?\.data \?\? null, brand_memories: memories\?\.data \?\? \[\],\s*analytics_report_references: reports\?\.data \?\? \[\], agent_config: config\.data \?\? null,\s*content_handoff: selectContentHandoff\(task, handoff\?\.data \?\? \[\], contentResultSchema\) \}\)/);

  assert.match(route, /shouldLookupContentHandoff\(task\) \? admin\.from\("ai_tasks"\)/);
  for (const filter of [
    '.eq("assigned_agent", "content")', '.eq("status", "completed")', '.eq("content_item_id", task.content_item_id)',
    '.neq("id", task.id)', '.eq("structured_output->>kind", "content_result")',
    '.order("completed_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(1)',
    'handoffQuery.eq("client_id", task.client_id) : handoffQuery.is("client_id", null)',
    'handoffQuery.eq("project_id", task.project_id) : handoffQuery.is("project_id", null)',
  ]) assert.ok(route.includes(filter), filter);
  assert.doesNotMatch(route, /\.(insert|update|upsert|delete|rpc)\(/);
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

test("tasks tool accepts operational date-range and status filters", () => {
  const base = {
    schema_version: 1,
    task_id: "00000000-0000-4000-8000-000000000001",
    run_id: "00000000-0000-4000-8000-000000000002",
  };
  const valid = (filters) => tasksToolRequestSchema.safeParse({ ...base, filters }).success;

  assert.equal(valid({}), true);
  assert.equal(valid({ client_id: null, project_id: null, due_before: null, limit: 25 }), true);
  assert.equal(valid({ due_after: "2026-09-25" }), true);
  assert.equal(valid({ due_after: null }), true);
  assert.equal(valid({ due_after: "2026-09-25", due_before: "2026-10-31" }), true);
  assert.equal(valid({ due_after: "2026-09-25", due_before: "2026-09-25" }), true);
  assert.equal(valid({ due_after: "2026-11-01", due_before: "2026-10-31" }), false);
  assert.equal(valid({ due_after: "next week" }), false);

  assert.equal(valid({ status: ["in_progress", "for_review"] }), true);
  assert.equal(valid({ production_status: ["not_started", "changes_required"] }), true);
  assert.equal(valid({ publishing_status: ["unscheduled", "scheduled"] }), true);
  assert.equal(valid({
    due_after: "2026-09-25",
    status: ["scheduled"],
    production_status: ["complete"],
    publishing_status: ["scheduled"],
    limit: 100,
  }), true);

  assert.equal(valid({ status: ["done"] }), false);
  assert.equal(valid({ status: ["approved"] }), false);
  assert.equal(valid({ production_status: ["for_review"] }), false);
  assert.equal(valid({ publishing_status: ["published"] }), false);
  assert.equal(valid({ status: "in_progress" }), false);
  assert.equal(valid({ status: [] }), false);
  assert.equal(valid({ production_status: [] }), false);
  assert.equal(valid({ publishing_status: [] }), false);
  assert.equal(valid({ status: Array(21).fill("in_progress") }), false);
  assert.equal(valid({ status_column: "title" }), false);

  assert.equal(valid({ limit: 0 }), false);
  assert.equal(valid({ limit: 101 }), false);
  assert.equal(valid({ limit: 1.5 }), false);
  assert.equal(tasksToolRequestSchema.parse({ ...base, filters: { status: ["posted"] } }).filters.limit, 50);
});

test("tasks tool status enums match the canonical public.tasks values", () => {
  assert.deepEqual(tasksToolTaskStatusSchema.options, [...SOCIAL_POST_STATUSES]);
  assert.deepEqual(tasksToolProductionStatusSchema.options, [...SOCIAL_PRODUCTION_STATUSES]);
  assert.deepEqual(tasksToolPublishingStatusSchema.options, [...SOCIAL_PUBLISHING_STATUSES]);
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

  const filtered = tasksToolRequestSchema.parse({ schema_version: 1, task_id: taskId, run_id: otherTaskId,
    filters: { due_after: "2026-09-25", status: ["in_progress"], production_status: ["in_progress"], publishing_status: ["unscheduled"] } });
  assert.deepEqual(authorizeTasksToolRequest({ request: filtered, run: { task_id: taskId }, task, config }), {
    ok: true, clientId, projectId, permittedClientIds: [clientId], permittedProjectIds: [projectId],
  });
  assert.deepEqual(authorizeTasksToolRequest({ request: { ...filtered, filters: { ...filtered.filters, client_id: otherClientId } },
    run: { task_id: taskId }, task, config }), { ok: false, reason: "client_scope_conflict" });
  assert.deepEqual(authorizeTasksToolRequest({ request: { ...filtered, filters: { ...filtered.filters, project_id: otherProjectId } },
    run: { task_id: taskId }, task, config }), { ok: false, reason: "project_scope_conflict" });
  assert.deepEqual(authorizeTasksToolRequest({ request: filtered, run: { task_id: taskId },
    task: { ...task, client_id: null, project_id: null }, config }), {
    ok: true, clientId: null, projectId: null, permittedClientIds: [clientId], permittedProjectIds: [projectId],
  });
});

test("tasks tool exposes only the approved operational task fields", () => {
  assert.deepEqual(TASKS_TOOL_SELECT.split(", "), [
    "id", "client_id", "division_task_id", "title", "brief", "status", "production_status", "publishing_status",
    "due_date", "scheduled_at", "platform", "format", "assignee_usernames", "watcher_usernames", "mentioned_usernames", "created_at",
  ]);
});

const projectsIds = {
  task: "00000000-0000-4000-8000-000000000001",
  otherTask: "00000000-0000-4000-8000-000000000002",
  client: "00000000-0000-4000-8000-000000000003",
  otherClient: "00000000-0000-4000-8000-000000000004",
  project: "00000000-0000-4000-8000-000000000005",
  otherProject: "00000000-0000-4000-8000-000000000006",
  run: "00000000-0000-4000-8000-000000000007",
};
const projectsRequest = (filters = {}) => projectsToolRequestSchema.parse({
  schema_version: 1, task_id: projectsIds.task, run_id: projectsIds.run, filters,
});
const projectsAuthorize = ({ filters = {}, task = {}, config = {}, run = { task_id: projectsIds.task } } = {}) =>
  authorizeProjectsToolRequest({
    request: projectsRequest(filters),
    run,
    task: { id: projectsIds.task, assigned_agent: "operations", client_id: null, project_id: null, ...task },
    config: { allowed_tools: ["projects"], permitted_client_ids: [], permitted_project_ids: [], ...config },
  });

test("signed projects tool requests validate their versioned read filters", () => {
  const secret = "a-long-shared-secret-with-more-than-32-bytes";
  const timestamp = "1789592400";
  const body = JSON.stringify({ schema_version: 1, task_id: projectsIds.task, run_id: projectsIds.run, filters: {} });
  const signature = signAiPayload(secret, timestamp, body);

  assert.equal(verifyAiPayload({ secret, timestamp, signature, body, now: 1789592400000 }), true);
  const parsed = projectsToolRequestSchema.safeParse(JSON.parse(body));
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.filters.limit, 50);

  const base = { schema_version: 1, task_id: projectsIds.task, run_id: projectsIds.run };
  assert.equal(projectsToolRequestSchema.safeParse({ ...base, schema_version: 2, filters: {} }).success, false);
  assert.equal(projectsToolRequestSchema.safeParse({ ...base, run_id: "invalid", filters: {} }).success, false);
  assert.equal(projectsToolRequestSchema.safeParse({ ...base, task_id: "invalid", filters: {} }).success, false);
  assert.equal(projectsToolRequestSchema.safeParse({ ...base, filters: {}, extra: true }).success, false);
  assert.equal(projectsToolRequestSchema.safeParse({ ...base, filters: { client_id: "not-a-uuid" } }).success, false);
});

test("projects tool accepts division, status, and date-range filters", () => {
  const base = { schema_version: 1, task_id: projectsIds.task, run_id: projectsIds.run };
  const valid = (filters) => projectsToolRequestSchema.safeParse({ ...base, filters }).success;

  assert.equal(valid({}), true);
  assert.equal(valid({ client_id: null, project_id: null, due_after: null, due_before: null, limit: 25 }), true);
  assert.equal(valid({ division: ["social-media", "website"] }), true);
  assert.equal(valid({ division: ["ads", "branding", "event"] }), true);
  assert.equal(valid({ status: ["planning", "production"] }), true);
  assert.equal(valid({ status: ["review", "approved"] }), true);
  assert.equal(valid({ due_after: "2026-09-25" }), true);
  assert.equal(valid({ due_before: "2026-10-31" }), true);
  assert.equal(valid({ due_after: "2026-09-25", due_before: "2026-10-31" }), true);
  assert.equal(valid({ due_after: "2026-09-25", due_before: "2026-09-25" }), true);
  assert.equal(valid({ division: ["website"], status: ["production"], due_after: "2026-09-25", limit: 100 }), true);

  assert.equal(valid({ due_after: "2026-11-01", due_before: "2026-10-31" }), false);
  assert.equal(valid({ due_after: "next week" }), false);
  assert.equal(valid({ division: ["social"] }), false);
  assert.equal(valid({ division: ["Website"] }), false);
  assert.equal(valid({ division: "website" }), false);
  assert.equal(valid({ status: ["in_progress"] }), false);
  assert.equal(valid({ status: ["done"] }), false);
  assert.equal(valid({ division: [] }), false);
  assert.equal(valid({ status: [] }), false);
  assert.equal(valid({ division: Array(21).fill("website") }), false);
  assert.equal(valid({ status: Array(21).fill("planning") }), false);
  assert.equal(valid({ limit: 0 }), false);
  assert.equal(valid({ limit: 101 }), false);
  assert.equal(valid({ limit: 1.5 }), false);
  assert.equal(valid({ template_type: "internal_approval" }), false);
  assert.equal(valid({ production_status: ["complete"] }), false);
  assert.equal(valid({ order: "title" }), false);
});

test("projects tool enums match the canonical lib/division-tasks.ts values", async () => {
  // lib/division-tasks.ts imports through the @/ alias, which the node test runner cannot resolve,
  // so the canonical arrays are read from source.
  const source = await readFile(new URL("../lib/division-tasks.ts", import.meta.url), "utf8");
  const canonical = (name) => {
    const match = source.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\] as const;`));
    assert.ok(match, `${name} not found in lib/division-tasks.ts`);
    return [...match[1].matchAll(/"([^"]+)"/g)].map((value) => value[1]);
  };
  assert.deepEqual(projectsToolDivisionSchema.options, canonical("DIVISIONS"));
  assert.deepEqual(projectsToolStatusSchema.options, canonical("DIVISION_TASK_STATUSES"));
});

test("projects tool authorization rejects run mismatches and disabled tools", () => {
  assert.deepEqual(projectsAuthorize({ run: { task_id: projectsIds.otherTask } }), { ok: false, reason: "task_or_run_not_found" });
  assert.deepEqual(projectsAuthorize({ run: null }), { ok: false, reason: "task_or_run_not_found" });
  assert.deepEqual(authorizeProjectsToolRequest({ request: projectsRequest(), run: { task_id: projectsIds.task }, task: null,
    config: { allowed_tools: ["projects"], permitted_client_ids: [], permitted_project_ids: [] } }), { ok: false, reason: "task_or_run_not_found" });
  assert.deepEqual(projectsAuthorize({ config: { allowed_tools: ["tasks"] } }), { ok: false, reason: "tool_not_allowed" });
  assert.deepEqual(projectsAuthorize({ config: { allowed_tools: null } }), { ok: false, reason: "tool_not_allowed" });
  assert.deepEqual(authorizeProjectsToolRequest({ request: projectsRequest(), run: { task_id: projectsIds.task },
    task: { id: projectsIds.task, assigned_agent: "operations", client_id: null, project_id: null }, config: null }),
  { ok: false, reason: "tool_not_allowed" });
});

test("projects tool enforces task and agent client/project scopes", () => {
  const { client, otherClient, project, otherProject } = projectsIds;
  // Task client/project scope is applied even when the request omits filters.
  assert.deepEqual(projectsAuthorize({ task: { client_id: client } }),
    { ok: true, clientId: client, projectId: null, permittedClientIds: [], permittedProjectIds: [] });
  assert.deepEqual(projectsAuthorize({ task: { project_id: project } }),
    { ok: true, clientId: null, projectId: project, permittedClientIds: [], permittedProjectIds: [] });

  // Conflicting requested IDs are rejected.
  assert.deepEqual(projectsAuthorize({ task: { client_id: client }, filters: { client_id: otherClient } }),
    { ok: false, reason: "client_scope_conflict" });
  assert.deepEqual(projectsAuthorize({ task: { project_id: project }, filters: { project_id: otherProject } }),
    { ok: false, reason: "project_scope_conflict" });
  assert.equal(projectsAuthorize({ task: { client_id: client }, filters: { client_id: client } }).ok, true);

  // Agent permitted scopes.
  assert.deepEqual(projectsAuthorize({ config: { permitted_client_ids: [client] }, filters: { client_id: otherClient } }),
    { ok: false, reason: "client_scope_conflict" });
  assert.deepEqual(projectsAuthorize({ config: { permitted_client_ids: [client] }, task: { client_id: otherClient } }),
    { ok: false, reason: "client_scope_conflict" });
  assert.deepEqual(projectsAuthorize({ config: { permitted_project_ids: [project] }, filters: { project_id: otherProject } }),
    { ok: false, reason: "project_scope_conflict" });
  assert.deepEqual(projectsAuthorize({ config: { permitted_project_ids: [project] }, task: { project_id: otherProject } }),
    { ok: false, reason: "project_scope_conflict" });
  assert.deepEqual(projectsAuthorize({ config: { permitted_client_ids: [client], permitted_project_ids: [project] } }),
    { ok: true, clientId: null, projectId: null, permittedClientIds: [client], permittedProjectIds: [project] });
});

test("projects tool query plan applies scope, visibility, and fixed filters only", () => {
  const { client, project } = projectsIds;
  const plan = (options) => {
    const authorization = projectsAuthorize(options);
    assert.equal(authorization.ok, true);
    return projectsToolFilters(authorization, projectsRequest(options.filters ?? {}).filters);
  };
  const visibility = { op: "or", value: "template_type.is.null,template_type.neq.internal_approval" };
  assert.equal(PROJECTS_TOOL_VISIBILITY_FILTER, visibility.value);

  // internal_approval records are always excluded, even for an unfiltered request.
  assert.deepEqual(plan({}), [visibility]);

  assert.deepEqual(plan({ task: { client_id: client } }), [visibility, { op: "eq", column: "client_id", value: client }]);
  assert.deepEqual(plan({ task: { project_id: project } }), [visibility, { op: "eq", column: "id", value: project }]);
  assert.deepEqual(plan({ config: { permitted_client_ids: [client], permitted_project_ids: [project] } }), [
    visibility,
    { op: "in", column: "client_id", values: [client] },
    { op: "in", column: "id", values: [project] },
  ]);
  assert.deepEqual(plan({ filters: { client_id: client, project_id: project } }), [
    visibility,
    { op: "eq", column: "client_id", value: client },
    { op: "eq", column: "id", value: project },
  ]);
  assert.deepEqual(plan({ filters: { division: ["website", "ads"], status: ["review"], due_after: "2026-09-25", due_before: "2026-10-31" } }), [
    visibility,
    { op: "in", column: "division", values: ["website", "ads"] },
    { op: "in", column: "status", values: ["review"] },
    { op: "gte", column: "due_date", value: "2026-09-25" },
    { op: "lte", column: "due_date", value: "2026-10-31" },
  ]);
});

test("projects tool reads division_tasks with the approved fields and response contract", async () => {
  assert.deepEqual(PROJECTS_TOOL_SELECT.split(", "), [
    "id", "client_id", "division", "title", "description", "status", "template_type",
    "assignee_usernames", "watcher_usernames", "mentioned_usernames", "start_date", "due_date", "created_at",
  ]);
  for (const hidden of ["content_brief_data", "research_entries", "filming_card_data", "figjam_embed_url"]) {
    assert.equal(PROJECTS_TOOL_SELECT.includes(hidden), false);
  }

  const route = await readFile(new URL("../app/api/integrations/n8n/tools/projects/route.ts", import.meta.url), "utf8");
  assert.match(route, /admin\.from\("division_tasks"\)/);
  assert.doesNotMatch(route, /from\("tasks"\)/);
  assert.doesNotMatch(route, /\.(insert|update|upsert|delete|rpc)\(/);
  assert.match(route, /verifyAiPayload\(\{[\s\S]*N8N_PORTAL_SHARED_SECRET[\s\S]*x-ai-timestamp[\s\S]*x-ai-signature[\s\S]*body: raw/);
  assert.match(route, /\.order\("due_date", \{ ascending: true, nullsFirst: false \}\)\s*\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(route, /schema_version: 1,\s*tool: "projects",\s*count: projects\?\.length \?\? 0,\s*projects: projects \?\? \[\]/);
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
