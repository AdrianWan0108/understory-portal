import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { deriveAgents, ago } = createRequire(import.meta.url)("../renderer/state.js");
const agent = (key, enabled = true) => ({ key, name: key, responsibility: "", visual_key: key, enabled });
const task = (id, assigned_agent, status, extra = {}) => ({ id, assigned_agent, title: id, status, priority: "normal", current_stage: null, requested_at: "2026-10-30T00:00:00Z", completed_at: null, portal_deep_link: `/t/${id}`, ...extra });

test("each agent gets the state of its most important task", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const desks = deriveAgents({
    agents: [agent("a"), agent("b"), agent("c"), agent("d"), agent("e"), agent("f", false)],
    tasks: [
      task("a2", "a", "queued"), task("a1", "a", "running", { current_stage: "drafting" }),
      task("b1", "b", "waiting_for_approval"),
      task("c2", "c", "queued"), task("c1", "c", "queued"),
      task("d1", "d", "failed"),
      task("e1", "e", "completed", { completed_at: "2026-10-30T09:00:00Z" }),
      task("f1", "f", "running"),
    ],
    events: [{ id: "ev", task_id: "a1", kind: "stage", summary: "Drafting", created_at: "2026-10-30T11:59:00Z" }],
    pending_approvals: ["b1"],
  }, now);
  assert.deepEqual(desks.map((desk) => desk.state), ["working", "waiting", "queued", "failed", "idle", "paused"]);
  assert.equal(desks[0].current.id, "a1");
  assert.equal(desks[0].queued, 1);
  assert.equal(desks[0].lastEvent.id, "ev");
  assert.equal(desks[2].current.id, "c1", "the oldest queued task is next");
  assert.equal(desks[4].current, null);
  assert.equal(desks[4].doneToday, 1);
});

test("a failure only counts while it is the agent's latest task", () => {
  const [desk] = deriveAgents({ agents: [agent("a")], tasks: [task("new", "a", "completed"), task("old", "a", "failed")], events: [] });
  assert.equal(desk.state, "idle");
});

test("an empty snapshot gives no desks", () => {
  assert.deepEqual(deriveAgents({}), []);
  assert.equal(ago("2026-10-30T11:30:00Z", Date.parse("2026-10-30T12:00:00Z")), "30 分鐘前");
});

test("event boards show the countdown, progress and only non-empty sections", () => {
  const { deriveEventBoards } = createRequire(import.meta.url)("../renderer/state.js");
  const item = (title, extra = {}) => ({ id: title, title, owner: "Karen", due_date: "2026-11-09", status: "todo", blocker: null, waiting_on: null, ...extra });
  const [board] = deriveEventBoards({ event_boards: [{
    plan_id: "p", title: "Anniversary", stage: "before", days_to_start: 16, progress: { done: 2, total: 27, percent: 7 },
    blocked: [item("Mindbody", { status: "blocked", blocker: "Needs Gary" })], overdue: [], due_soon: [item("Call Giacomo")],
    waiting: [item("Gary decides", { owner: "Gary", waiting_on: "Gary" })],
    owners: [{ owner: "Karen", open: 18, next: [item("Call Giacomo")] }],
  }] });
  assert.equal(board.countdown, "仲有 16 日");
  assert.equal(board.percent, 7);
  assert.deepEqual(board.sections.map((section) => section.key), ["blocked", "due_soon", "waiting"]);
  assert.deepEqual(board.sections[0].items[0], ["Mindbody", "11/9 · Karen · Needs Gary"]);
  assert.deepEqual(board.owners[0], { owner: "Karen", open: 18, next: "Call Giacomo" });
  assert.equal(deriveEventBoards({}).length, 0, "older portals without event boards show nothing");
});

test("the Event Planner reads as tracking an active event between checks", () => {
  const boards = [{ plan_id: "p", title: "Anniversary", stage: "before", days_to_start: 14, blocked: [{}], overdue: [], due_soon: [{}, {}] }];
  const [events, other] = deriveAgents({ agents: [agent("events"), agent("ops")], tasks: [], events: [], event_boards: boards });
  assert.equal(events.state, "tracking");
  assert.equal(events.focus, "跟緊 Anniversary · 仲有 14 日 · 1 個卡住 · 2 個 3 日內到期");
  assert.equal(other.state, "idle");
  const [running] = deriveAgents({ agents: [agent("events")], tasks: [task("t", "events", "running")], events: [], event_boards: boards });
  assert.equal(running.state, "working", "a running check still shows as working");
  const [after] = deriveAgents({ agents: [agent("events")], tasks: [], events: [], event_boards: [{ ...boards[0], stage: "after" }] });
  assert.equal(after.state, "idle", "a finished event is not tracked");
});
