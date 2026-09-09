import assert from "node:assert/strict";
import test from "node:test";
import {
  absoluteSocialPostUrl,
  legacySocialPostPathSegment,
  socialPostHref,
  socialPostIdFromPathSegment,
  socialPostIdToToken,
  socialPostTitleSlug,
  socialPostTokenToId,
} from "../lib/social-post-links.ts";

const POST_ID = "e80534bf-514e-4fdf-9773-26eb3378bf85";

test("builds a readable, stable social post URL", () => {
  const href = socialPostHref({
    id: POST_ID,
    title: "September Launch: Behind the Scenes!",
  });

  assert.equal(
    href,
    "/team-hub/social-media-calendar/september-launch-behind-the-scenes",
  );
  assert.equal(
    absoluteSocialPostUrl("https://portal.example.com", {
      id: POST_ID,
      title: "September Launch: Behind the Scenes!",
    }),
    `https://portal.example.com${href}`,
  );
});

test("round-trips the compact UUID token", () => {
  const token = socialPostIdToToken(POST_ID);

  assert.equal(token, "6AU0v1FOT9-XcybrM3i_hQ");
  assert.equal(socialPostTokenToId(token), POST_ID);
  assert.equal(socialPostTokenToId("not-a-valid-token"), null);
});

test("resolves an old title slug after the post is renamed", () => {
  const oldSegment = legacySocialPostPathSegment({
    id: POST_ID,
    title: "Old name",
  });

  assert.equal(socialPostIdFromPathSegment(oldSegment), POST_ID);
  assert.equal(socialPostTitleSlug("Café / 秋季 推廣"), "cafe-秋季-推廣");
});
