import test from "node:test";
import assert from "node:assert/strict";
import { syncClientReview } from "../lib/client-review-sync.ts";

test("a Boardwalk client comment reaches the Dashboard activity feed and Slack", async () => {
  const calls = [];
  const result = await syncClientReview(
    {
      clientSlug: "boardwalk",
      clientName: "Boardwalk",
      action: "requested_changes",
      title: "August frame styling carousel",
      reviewerName: "Sarah",
      comment: "Please use the blue frame in slide three.",
      assigneeNames: ["Emilia"],
    },
    {
      writeActivity: async (activity) => {
        calls.push({ kind: "supabase", activity });
      },
      sendSlackMessage: async (target, text) => {
        calls.push({ kind: "slack", target, text });
      },
    },
  );

  assert.deepEqual(calls[0], {
    kind: "supabase",
    activity: {
      actor: "Sarah",
      action: "requested changes on",
      target: "August frame styling carousel",
      client_slug: "boardwalk",
    },
  });
  assert.equal(calls.filter(({ kind }) => kind === "slack").length, 2);
  assert.match(calls[1].text, /Boardwalk requested changes/);
  assert.match(calls[2].text, /Please use the blue frame in slide three/);
  assert.equal(result.activity.target, "August frame styling carousel");
});

test("the Slack send is not attempted if the Dashboard activity write fails", async () => {
  let slackAttempted = false;

  await assert.rejects(
    syncClientReview(
      {
        clientSlug: "boardwalk",
        clientName: "Boardwalk",
        action: "requested_changes",
        title: "Test post",
        reviewerName: "Sarah",
        comment: "Test feedback",
      },
      {
        writeActivity: async () => {
          throw new Error("Supabase unavailable");
        },
        sendSlackMessage: async () => {
          slackAttempted = true;
        },
      },
    ),
    /Supabase unavailable/,
  );

  assert.equal(slackAttempted, false);
});
