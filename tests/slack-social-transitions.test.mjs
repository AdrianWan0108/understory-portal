import test from "node:test";
import assert from "node:assert/strict";
import { claimSocialTransitionKey } from "../lib/slack-notifications.ts";

test("a social workflow transition is notified only once per transition key", () => {
  const seen = new Set();
  const key = "post-1:scheduled:2026-09-02T16:00:00.000Z";
  assert.equal(claimSocialTransitionKey(seen, key), true);
  assert.equal(claimSocialTransitionKey(seen, key), false);
  assert.equal(
    claimSocialTransitionKey(
      seen,
      "post-1:posted:2026-09-03T16:00:00.000Z",
    ),
    true,
  );
});
