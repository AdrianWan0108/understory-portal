import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSocialPostStatus,
  SOCIAL_POST_STATUSES,
  SOCIAL_POST_STATUS_LABELS,
} from "../lib/social-content.ts";

test("social workflow statuses share one complete label map", () => {
  assert.deepEqual(Object.keys(SOCIAL_POST_STATUS_LABELS), [
    ...SOCIAL_POST_STATUSES,
  ]);
  assert.equal(SOCIAL_POST_STATUS_LABELS.for_review, "Awaiting approvals");
  assert.equal(
    SOCIAL_POST_STATUS_LABELS.internal_approved,
    "Internal approved",
  );
});

test("legacy social statuses normalize to the current shared workflow", () => {
  assert.equal(normalizeSocialPostStatus("approved"), "internal_approved");
  assert.equal(normalizeSocialPostStatus("needs_revision"), "changes_requested");
  assert.equal(normalizeSocialPostStatus("posted"), "posted");
  assert.equal(normalizeSocialPostStatus("unexpected"), "not_started");
});
