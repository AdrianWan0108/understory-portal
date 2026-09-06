import test from "node:test";
import assert from "node:assert/strict";
import {
  canScheduleSocialPost,
  deriveClientApprovalState,
  deriveInternalApprovalState,
  deriveSocialWorkflowPhase,
  estimateSocialProductionDeadline,
  normalizeSocialFilmingDetails,
  normalizeSocialPostStatus,
  normalizeSocialProductionStatus,
  normalizeSocialPublishingStatus,
  normalizeSocialSchedulingMode,
  normalizeStoryInteraction,
  normalizeReelDetails,
  productionStatusAfterTransition,
  publishingStatusAfterTransition,
  reconcileSocialProductionStatus,
  requiredSocialClientReviewerKeys,
  SOCIAL_PRODUCTION_STATUSES,
  SOCIAL_PRODUCTION_STATUS_LABELS,
  SOCIAL_PUBLISHING_STATUSES,
  SOCIAL_PUBLISHING_STATUS_LABELS,
  SOCIAL_SCHEDULING_MODES,
  SOCIAL_SCHEDULING_MODE_LABELS,
  SOCIAL_POST_STATUSES,
  SOCIAL_POST_STATUS_LABELS,
  SOCIAL_POST_FORMATS,
} from "../lib/social-content.ts";

test("MVP client approval requires Gary but not Dorothy", () => {
  assert.deepEqual(requiredSocialClientReviewerKeys("mvp"), ["MVP_Gary"]);
  assert.deepEqual(requiredSocialClientReviewerKeys("boardwalk"), [
    "Boardwalk_Sarah",
  ]);
  assert.deepEqual(requiredSocialClientReviewerKeys(null), []);
});

test("social workflow statuses share one complete label map", () => {
  assert.equal(SOCIAL_POST_FORMATS.includes("story"), true);
  assert.deepEqual(Object.keys(SOCIAL_POST_STATUS_LABELS), [
    ...SOCIAL_POST_STATUSES,
  ]);
  assert.equal(SOCIAL_POST_STATUS_LABELS.for_review, "Awaiting approvals");
  assert.equal(
    SOCIAL_POST_STATUS_LABELS.internal_approved,
    "Internal approved",
  );
  assert.equal(SOCIAL_POST_STATUS_LABELS.external_approved, "Client approved");
  assert.deepEqual(SOCIAL_POST_STATUSES.slice(-4), [
    "external_approved",
    "scheduled",
    "changes_requested",
    "posted",
  ]);
  assert.equal(SOCIAL_POST_STATUS_LABELS.scheduled, "Scheduled");
});

test("legacy statuses backfill into independent production and publishing dimensions", () => {
  assert.equal(normalizeSocialProductionStatus(null, "for_review"), "ready_for_review");
  assert.equal(normalizeSocialProductionStatus(null, "changes_requested"), "changes_required");
  assert.equal(normalizeSocialProductionStatus(null, "external_approved"), "complete");
  assert.equal(normalizeSocialPublishingStatus(null, "scheduled", null), "scheduled");
  assert.equal(normalizeSocialPublishingStatus(null, "not_started", "2026-09-01T12:00:00Z"), "posted");
  assert.deepEqual(Object.keys(SOCIAL_PRODUCTION_STATUS_LABELS), [...SOCIAL_PRODUCTION_STATUSES]);
  assert.deepEqual(Object.keys(SOCIAL_PUBLISHING_STATUS_LABELS), [...SOCIAL_PUBLISHING_STATUSES]);
  assert.equal(normalizeSocialSchedulingMode("manual"), "manual");
  assert.equal(normalizeSocialSchedulingMode("unexpected"), "automatic");
  assert.deepEqual(Object.keys(SOCIAL_SCHEDULING_MODE_LABELS), [...SOCIAL_SCHEDULING_MODES]);
});

test("production transitions return changes to production and complete internal review", () => {
  assert.equal(productionStatusAfterTransition("not_started", "start_production"), "in_progress");
  assert.equal(productionStatusAfterTransition("in_progress", "submit_internal_review"), "ready_for_review");
  assert.equal(productionStatusAfterTransition("ready_for_review", "request_internal_changes"), "changes_required");
  assert.equal(productionStatusAfterTransition("ready_for_review", "complete_internal_review"), "complete");
  assert.equal(productionStatusAfterTransition("complete", "request_client_changes"), "changes_required");
});

test("current workflow phase includes active production before review", () => {
  const post = {
    live_post_url: null,
    publishing_status: "unscheduled",
    production_status: "in_progress",
    client_approvals: {},
    sent_to_client_at: null,
    internal_review_submitted_at: null,
    requires_filming: false,
    filming_details: { filmed: false },
  };

  assert.equal(deriveSocialWorkflowPhase(post, []), "production");
  assert.equal(
    deriveSocialWorkflowPhase(
      { ...post, production_status: "ready_for_review" },
      [],
    ),
    "approval",
  );
});

test("production deadlines are estimated from publish date and content readiness", () => {
  const completeImage = estimateSocialProductionDeadline({
    scheduledAt: "2026-09-14T10:00:00-04:00",
    format: "image",
    purpose: "Explain the product benefit clearly to prospective customers.",
    targetAudience: "Prospective eyewear customers",
    cta: "Book an appointment",
    brief: "Create a polished product post with one clear benefit and a concise supporting message.",
    visualNote: "Use a clean product photograph with branded typography.",
    postCaption: "A clear product benefit supported by a concise call to action.",
    reelDetails: normalizeReelDetails(null),
    requiresFilming: false,
    filmingDetails: normalizeSocialFilmingDetails(null),
    slides: [],
  });
  const incompleteImage = estimateSocialProductionDeadline({
    scheduledAt: "2026-09-14T10:00:00-04:00",
    format: "image",
    purpose: "",
    targetAudience: "",
    cta: "",
    brief: "",
    visualNote: "",
    postCaption: "",
    reelDetails: normalizeReelDetails(null),
    requiresFilming: false,
    filmingDetails: normalizeSocialFilmingDetails(null),
    slides: [],
  });

  assert.equal(completeImage.date, "2026-09-09");
  assert.equal(completeImage.leadTimeBusinessDays, 3);
  assert.equal(incompleteImage.date, "2026-09-07");
  assert.equal(incompleteImage.leadTimeBusinessDays, 5);
  assert.equal(incompleteImage.contentReadinessPercent, 0);
});

test("complex unfinished video production receives a longer deadline", () => {
  const estimate = estimateSocialProductionDeadline({
    scheduledAt: "2026-09-21T10:00:00-04:00",
    format: "reel",
    purpose: "Explain the full production process and build customer trust.",
    targetAudience: "Prospective eyewear customers",
    cta: "Book an appointment",
    brief: "Create a detailed behind-the-scenes Reel that follows the product from raw material to final delivery.",
    visualNote: "Use documentary footage, branded graphics, and polished transitions.",
    postCaption: "",
    reelDetails: normalizeReelDetails({
      hook: "How your glasses are really made",
      script: "x".repeat(800),
      shotList: "1\n2\n3\n4\n5\n6\n7\n8",
      editingFlow: "Animation, motion tracking, subtitles, and sound design",
      onScreenText: "From raw material to your finished pair",
    }),
    requiresFilming: true,
    filmingDetails: {
      ...normalizeSocialFilmingDetails(null),
      needsModels: true,
      filmed: false,
    },
    slides: [],
  });

  assert.equal(estimate.date, "2026-09-02");
  assert.equal(estimate.leadTimeBusinessDays, 13);
  assert.equal(estimate.complexity, "high");
});

test("client handoff reconciles legacy production status", () => {
  assert.equal(
    reconcileSocialProductionStatus(
      "ready_for_review",
      "2026-09-01T12:00:00Z",
      { MVP_Gary: { status: "approved" } },
    ),
    "complete",
  );
  assert.equal(
    reconcileSocialProductionStatus(
      "complete",
      "2026-09-01T12:00:00Z",
      { MVP_Gary: { status: "changes" } },
    ),
    "changes_required",
  );
});

test("approval states are derived from submission markers and approval JSON", () => {
  const approved = { reviewer: { status: "approved" } };
  const changes = { reviewer: { status: "changes", comment: "Revise this" } };
  assert.equal(deriveInternalApprovalState(approved, ["reviewer"], null), "not_submitted");
  assert.equal(deriveInternalApprovalState({}, ["reviewer"], "2026-09-01"), "pending");
  assert.equal(deriveInternalApprovalState(approved, ["reviewer"], "2026-09-01"), "approved");
  assert.equal(deriveClientApprovalState(changes, ["reviewer"], "2026-09-01"), "changes_requested");
  assert.equal(deriveClientApprovalState(approved, ["reviewer"], null), "not_sent");
});

test("scheduling requires a date, client handoff, and completed client approval", () => {
  assert.equal(canScheduleSocialPost({ scheduledAt: "2026-09-02T16:00:00Z", sentToClientAt: "2026-09-01", clientApprovalState: "approved" }), true);
  assert.equal(canScheduleSocialPost({ scheduledAt: null, sentToClientAt: "2026-09-01", clientApprovalState: "approved" }), false);
  assert.equal(canScheduleSocialPost({ scheduledAt: "2026-09-02T16:00:00Z", sentToClientAt: "2026-09-01", clientApprovalState: "pending" }), false);
});

test("publishing transitions drive scheduled and posted/archive membership", () => {
  assert.equal(publishingStatusAfterTransition("unscheduled", "confirm_scheduled"), "scheduled");
  assert.equal(publishingStatusAfterTransition("scheduled", "mark_posted"), "posted");
  assert.equal(publishingStatusAfterTransition("posted", "restore_posted"), "scheduled");
});

test("legacy social statuses normalize to the current shared workflow", () => {
  assert.equal(normalizeSocialPostStatus("approved"), "internal_approved");
  assert.equal(normalizeSocialPostStatus("needs_revision"), "changes_requested");
  assert.equal(normalizeSocialPostStatus("scheduled"), "scheduled");
  assert.equal(normalizeSocialPostStatus("posted"), "posted");
  assert.equal(normalizeSocialPostStatus("unexpected"), "not_started");
});

test("Story interaction and Reel production details normalize safely", () => {
  assert.deepEqual(
    normalizeStoryInteraction({
      type: "poll",
      prompt: "Which one?",
      options: ["A", "B", 3],
    }),
    { type: "poll", prompt: "Which one?", options: ["A", "B"] },
  );
  assert.deepEqual(normalizeStoryInteraction(null), {
    type: "none",
    prompt: "",
    options: [],
  });

  assert.deepEqual(
    normalizeReelDetails({
      script: "Voiceover",
      shotList: "Wide shot",
      editingFlow: "Hook → reveal",
      onScreenText: "Watch this",
    }),
    {
      hook: "",
      script: "Voiceover",
      shotList: "Wide shot",
      editingFlow: "Hook → reveal",
      onScreenText: "Watch this",
      cta: "",
      videoUrl: "",
      footageLinks: [],
      referenceLinks: [],
    },
  );
});
