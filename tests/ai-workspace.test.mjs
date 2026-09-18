import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAiTaskSchema, structuredOutputSchema, taskEventSchema } from "../lib/ai-workspace/schemas.ts";
import { canReadAiTask, mayTransition, requiresHumanApproval } from "../lib/ai-workspace/policy.ts";
import { signAiPayload, verifyAiPayload } from "../lib/ai-workspace/signatures.ts";
import { aiSlackNotification } from "../lib/ai-workspace/slack-message.ts";

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
