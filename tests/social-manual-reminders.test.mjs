import test from "node:test";
import assert from "node:assert/strict";
import {
  buildManualPostReminderMessage,
  isManualPostReminderDue,
} from "../lib/social-manual-reminders.ts";

test("only due, scheduled manual posts trigger reminders", () => {
  const now = new Date("2026-09-03T16:05:00.000Z");
  const base = {
    schedulingMode: "manual",
    publishingStatus: "scheduled",
    scheduledAt: "2026-09-03T16:00:00.000Z",
    postedAt: null,
    reminderSentAt: null,
    now,
  };
  assert.equal(isManualPostReminderDue(base), true);
  assert.equal(
    isManualPostReminderDue({ ...base, schedulingMode: "automatic" }),
    false,
  );
  assert.equal(
    isManualPostReminderDue({
      ...base,
      scheduledAt: "2026-09-03T16:10:00.000Z",
    }),
    false,
  );
  assert.equal(
    isManualPostReminderDue({ ...base, reminderSentAt: now.toISOString() }),
    false,
  );
});

test("a manual Slack reminder includes the owner, creative, assets, and deep link", () => {
  const message = buildManualPostReminderMessage({
    clientName: "MVP",
    title: "Story launch",
    format: "Story",
    platform: "Instagram",
    scheduledAt: "2026-09-03T16:00:00.000Z",
    assigneeMentions: ["<@U123>"],
    brief: "Show the new class.",
    visualNote: "Use the green title card.",
    postCaption: "Book your spot.",
    creativeDriveLink: "https://drive.google.com/file/d/creative-1/view",
    slides: [
      {
        slideNumber: 1,
        onScreenText: "New class",
        imageUrl: "https://example.com/story.jpg",
        references: [
          { platform: "Instagram", url: "https://example.com/reference" },
        ],
      },
    ],
    directLink: "https://portal.example.com/calendar?post=post-1",
  });

  assert.match(message, /Manual social post due now/);
  assert.match(message, /<@U123>/);
  assert.match(message, /Show the new class/);
  assert.match(message, /Book your spot/);
  assert.match(message, /Open creative in Google Drive/);
  assert.match(message, /Open final asset/);
  assert.match(message, /Open post in Social Content Calendar/);
});

test("a carousel reminder uses slide captions without a post caption", () => {
  const message = buildManualPostReminderMessage({
    clientName: "Boardwalk",
    title: "New frames",
    format: "carousel",
    scheduledAt: "2026-09-03T16:00:00.000Z",
    postCaption: "Legacy whole-post caption",
    slides: [{ slideNumber: 1, caption: "Meet the green frames." }],
    directLink: "https://portal.example.com/calendar?post=post-2",
  });

  assert.doesNotMatch(message, /Legacy whole-post caption/);
  assert.match(message, /Meet the green frames/);
});
