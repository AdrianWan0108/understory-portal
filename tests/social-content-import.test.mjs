import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSocialContentImport,
  SOCIAL_CONTENT_IMPORT_EXAMPLE,
} from "../lib/social-content-import.ts";

test("the ChatGPT template imports Story, Reel, and Carousel production data", () => {
  const result = parseSocialContentImport(SOCIAL_CONTENT_IMPORT_EXAMPLE);

  assert.equal(result.posts.length, 3);
  assert.deepEqual(result.posts[0].storyInteraction, {
    type: "poll",
    prompt: "What should we share more of?",
    options: ["Tips", "Behind the scenes"],
  });
  assert.equal(result.posts[0].schedulingMode, "manual");
  assert.equal(result.posts[1].reelDetails.editingFlow.includes("reveal"), true);
  assert.equal(result.posts[1].reelDetails.onScreenText.includes("Before launch"), true);
  assert.equal(result.posts[1].reelDetails.coverUrl, "");
  assert.deepEqual(result.posts[1].reelDetails.coverUrls, {});
  assert.equal(result.posts[1].reelDetails.showInFeed, true);
  assert.equal(result.posts[2].slides.length, 3);
});

test("imports accept fenced JSON and common ChatGPT field aliases", () => {
  const result = parseSocialContentImport(`\`\`\`json
  {
    "posts": [{
      "title": "Question Story",
      "type": "Stories",
      "channels": ["Instagram", "Facebook"],
      "publishAt": "2026-09-30 09:30",
      "interaction": {
        "type": "question box",
        "question": "Ask us anything"
      }
    }]
  }
  \`\`\``);

  assert.equal(result.posts[0].format, "story");
  assert.equal(result.posts[0].platform, "Instagram, Facebook");
  assert.equal(result.posts[0].storyInteraction.type, "question_box");
  assert.equal(result.posts[0].storyInteraction.prompt, "Ask us anything");
  assert.equal(result.posts[0].slides.length, 1);
  assert.equal(result.warnings.length, 1);
});

test("imports preserve different Reel covers by channel", () => {
  const result = parseSocialContentImport(`{
    "posts": [{
      "title": "Channel covers",
      "format": "reel",
      "platforms": ["Instagram", "Bilibili"],
      "reel": {
        "coverUrls": {
          "Instagram": "https://drive.google.com/file/d/instagram-cover/view",
          "Bilibili": "https://drive.google.com/file/d/bilibili-cover/view"
        },
        "showInFeed": false
      }
    }]
  }`);

  assert.deepEqual(result.posts[0].reelDetails.coverUrls, {
    Instagram: "https://drive.google.com/file/d/instagram-cover/view",
    Bilibili: "https://drive.google.com/file/d/bilibili-cover/view",
  });
  assert.equal(result.posts[0].reelDetails.showInFeed, false);
});

test("imports stop before writing when a required field is invalid", () => {
  assert.throws(
    () =>
      parseSocialContentImport(
        JSON.stringify({ posts: [{ title: "No format" }] }),
      ),
    /invalid format/i,
  );
  assert.throws(
    () => parseSocialContentImport("not json"),
    /not valid JSON/i,
  );
});
