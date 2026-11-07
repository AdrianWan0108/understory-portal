import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  addDays, daysBetween, officeEventBoard, ownerMatches, summarizeEventPlan, todayIn,
  EVENT_ITEM_KINDS, EVENT_ITEM_STATUSES, EVENT_PLAN_STATUSES,
} from "../lib/ai-workspace/event-board.ts";
import { authorizeEventsToolRequest, eventPlanInScope } from "../lib/ai-workspace/events-tool.ts";
import {
  agentKeySchema, eventBriefSchema, eventItemCreateSchema, eventItemUpdateSchema, eventsToolRequestSchema, structuredOutputSchema, taskEventSchema,
} from "../lib/ai-workspace/schemas.ts";
import { eventBriefSlackMessage } from "../lib/ai-workspace/slack-message.ts";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const plan = { id: id(1), client_id: id(9), title: "Anniversary Week", start_date: "2026-11-23", end_date: "2026-11-27", timezone: "America/Toronto", status: "planning" };
const item = (n, extra = {}) => ({ id: id(100 + n), plan_id: plan.id, title: `Item ${n}`, phase: "Set up", kind: "task", owner: "Karen", due_date: "2026-11-10",
  status: "todo", blocker: null, waiting_on: null, sort_order: n * 10, ...extra });

test("event board summary computes progress, blockers, reminders and to-dos deterministically", () => {
  const items = [
    item(1, { status: "done", phase: "Decide" }),
    item(2, { status: "waiting", owner: "Gary", waiting_on: "Gary", due_date: "2026-11-09", phase: "Decide" }),
    item(3, { status: "blocked", blocker: "Needs Gary" }),
    item(4, { due_date: "2026-11-06" }),
    item(5, { due_date: "2026-11-11" }),
    item(6, { due_date: "2026-11-20" }),
    item(7, { status: "skipped" }),
    item(8, { due_date: null, owner: "karen ko" }),
    { ...item(9), plan_id: id(2) },
  ];
  const summary = summarizeEventPlan(plan, items, { today: "2026-11-07", me: ["Karen Ko"] });
  assert.equal(summary.days_to_start, 16);
  assert.equal(summary.stage, "before");
  assert.deepEqual(summary.progress, { done: 1, total: 7, percent: 14 }, "skipped items and other plans are not counted");
  assert.deepEqual(summary.phases, [{ phase: "Decide", done: 1, total: 2 }, { phase: "Set up", done: 0, total: 5 }]);
  assert.deepEqual(summary.blocked.map((row) => row.title), ["Item 3"]);
  assert.deepEqual(summary.waiting.map((row) => row.title), ["Item 2"]);
  assert.deepEqual(summary.overdue.map((row) => row.title), ["Item 4"]);
  assert.deepEqual(summary.due_soon.map((row) => row.title), ["Item 2", "Item 3"], "today through today + 3 days (Nov 10), not Nov 11");
  assert.deepEqual(summary.my_todos.map((row) => row.title), ["Item 4", "Item 3", "Item 5", "Item 6", "Item 8"], "sorted by due date, undated last");
  assert.equal(summarizeEventPlan(plan, items, { today: "2026-11-25" }).stage, "live");
  assert.equal(summarizeEventPlan(plan, items, { today: "2026-11-28" }).stage, "after");
  assert.deepEqual(summarizeEventPlan(plan, [], { today: "2026-11-07" }).progress, { done: 0, total: 0, percent: 0 });
});

test("date helpers and owner matching", () => {
  assert.equal(daysBetween("2026-11-07", "2026-11-23"), 16);
  assert.equal(addDays("2026-11-30", 2), "2026-12-02");
  assert.equal(todayIn("America/Toronto", new Date("2026-11-08T03:00:00Z")), "2026-11-07", "late evening in Toronto is still the 7th");
  assert.equal(todayIn("Not/AZone", new Date("2026-11-08T03:00:00Z")), "2026-11-08");
  assert.equal(ownerMatches("Karen", ["Karen Ko"]), true);
  assert.equal(ownerMatches("KAREN KO", ["Karen Ko"]), true);
  assert.equal(ownerMatches("Karen K", ["Karen Ko"]), false);
  assert.equal(ownerMatches(null, ["Karen"]), false);
  assert.equal(ownerMatches("Gary", ["", "Karen"]), false);
});

test("office event board groups open items by owner and keeps only display fields", () => {
  const items = [item(1, { status: "done" }), item(2, { owner: "Gary", due_date: "2026-11-09" }), item(3), item(4, { owner: null })];
  const board = officeEventBoard(summarizeEventPlan(plan, items, { today: "2026-11-07" }), items);
  assert.deepEqual(board.owners.map((entry) => [entry.owner, entry.open]), [["Gary", 1], ["Karen", 1], ["Unassigned", 1]]);
  assert.deepEqual(Object.keys(board.due_soon[0]).sort(), ["blocker", "due_date", "id", "owner", "status", "title", "waiting_on"]);
});

test("event schemas: agent key, tool request, item changes and brief output", () => {
  assert.equal(agentKeySchema.safeParse("events").success, true);
  assert.deepEqual(eventsToolRequestSchema.parse({ schema_version: 1, task_id: id(1), run_id: id(2) }).filters, { include_done: false });
  assert.equal(eventsToolRequestSchema.safeParse({ schema_version: 1, task_id: id(1), run_id: id(2), filters: { plan_id: id(3), column: "x" } }).success, false);
  assert.deepEqual(eventItemUpdateSchema.parse({ status: "done" }), { status: "done" }, "missing keys stay unchanged");
  assert.deepEqual(eventItemUpdateSchema.parse({ blocker: "  " }), { blocker: null }, "blank text clears a field");
  assert.equal(eventItemUpdateSchema.safeParse({}).success, false);
  assert.equal(eventItemUpdateSchema.safeParse({ status: "finished" }).success, false);
  assert.equal(eventItemCreateSchema.parse({ plan_id: id(1), title: "Call Giacomo" }).phase, "General");
  const brief = { schema_version: 1, kind: "event_brief", plan_id: id(1), plan_title: "Anniversary Week", as_of: "2026-11-07", days_to_start: 16,
    headline: "Gary's decisions block three tasks.", summary: "Two of 27 done.", progress: { done: 2, total: 27, percent: 7 },
    blockers: [{ item_id: id(5), title: "Mindbody", due_date: "2026-11-10", owner: "Karen", note: "Needs Gary" }], overdue: [], due_soon: [], your_todos: [],
    suggestions: ["Meet Gary this weekend."], requires_human_review: true };
  assert.equal(eventBriefSchema.safeParse(brief).success, true);
  assert.equal(structuredOutputSchema.safeParse(brief).success, true);
  assert.equal(eventBriefSchema.safeParse({ ...brief, requires_human_review: false }).success, false);
  assert.equal(eventBriefSchema.safeParse({ ...brief, extra: 1 }).success, false);
  assert.equal(taskEventSchema.safeParse({ schema_version: 1, event_id: id(1), task_id: id(1), run_id: id(1), correlation_id: id(1), idempotency_key: "event-brief-0001",
    trigger_source: "schedule", status: "completed", summary: "Brief ready", output: brief }).success, true);
  const message = eventBriefSlackMessage({ ...brief, url: "https://portal.example/team-hub/ai-workspace/events" });
  assert.match(message, /Anniversary Week\* · 16 days to go · 2\/27 done \(7%\)/);
  assert.match(message, /• Mindbody · 11\/10 · Karen/);
  assert.doesNotMatch(message, /Overdue/, "empty sections are left out");
});

test("events tool authorization uses the agent's tools and the task's plan and client scope", () => {
  const request = eventsToolRequestSchema.parse({ schema_version: 1, task_id: id(1), run_id: id(2) });
  const task = { id: id(1), client_id: id(9), input_payload: { plan_id: plan.id } };
  const config = { allowed_tools: ["events"], permitted_client_ids: [] };
  assert.deepEqual(authorizeEventsToolRequest({ request, run: { task_id: id(1) }, task, config }),
    { ok: true, planId: plan.id, clientId: id(9), permittedClientIds: [] });
  assert.equal(authorizeEventsToolRequest({ request, run: { task_id: id(3) }, task, config }).ok, false);
  assert.deepEqual(authorizeEventsToolRequest({ request, run: { task_id: id(1) }, task, config: { allowed_tools: ["projects"], permitted_client_ids: [] } }),
    { ok: false, reason: "tool_not_allowed" });
  assert.equal(authorizeEventsToolRequest({ request, run: { task_id: id(1) }, task: { ...task, input_payload: { plan_id: "nope" } }, config }).planId, null);
  assert.equal(eventPlanInScope({ client_id: id(9) }, { clientId: id(9), permittedClientIds: [] }), true);
  assert.equal(eventPlanInScope({ client_id: id(8) }, { clientId: id(9), permittedClientIds: [] }), false);
  assert.equal(eventPlanInScope({ client_id: id(8) }, { clientId: null, permittedClientIds: [id(9)] }), false);
  assert.equal(eventPlanInScope({ client_id: null }, { clientId: null, permittedClientIds: [id(9)] }), true);
});

test("event planner migration keeps the database and the TypeScript lists in sync", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261107000000_add_event_planner.sql", import.meta.url), "utf8");
  for (const key of agentKeySchema.options) assert.match(sql, new RegExp(`'${key}'`));
  const list = (column) => [...sql.match(new RegExp(`${column} in \\(([^)]*)\\)`))[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(list("status text not null default 'todo' check \\(status"), [...EVENT_ITEM_STATUSES]);
  assert.deepEqual(list("kind text not null default 'task' check \\(kind"), [...EVENT_ITEM_KINDS]);
  assert.deepEqual(list("status text not null default 'planning' check \\(status"), [...EVENT_PLAN_STATUSES]);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.event_plans, public\.event_plan_items from anon, authenticated/);
  const seed = await readFile(new URL("../supabase/migrations/20261107000100_seed_mvp_anniversary_event_plan.sql", import.meta.url), "utf8");
  for (const [, status] of seed.matchAll(/'\d{4}-\d{2}-\d{2}', '([a-z_]+)'/g)) assert.ok(EVENT_ITEM_STATUSES.includes(status), status);
});
