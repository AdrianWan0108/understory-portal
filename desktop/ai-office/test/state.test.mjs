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
