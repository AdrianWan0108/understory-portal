import assert from "node:assert/strict";
import test from "node:test";
import {
  extractFrameIoV4ShareParts,
  frameIoPlaybackUrl,
  frameIoThumbnailUrl,
  isFrameIoUrl,
  resolveReviewMediaLink,
} from "../lib/review-media-links.ts";

test("accepts Frame.io short and application links", () => {
  for (const url of [
    "https://f.io/_aBcDeF",
    "https://frame.io/share/abc123",
    "https://app.frame.io/reviews/abc123",
  ]) {
    assert.equal(isFrameIoUrl(url), true);
    assert.deepEqual(resolveReviewMediaLink(url), {
      provider: "frame-io",
      providerLabel: "Frame.io",
      openUrl: url,
      previewUrl: null,
    });
  }
});

test("embeds Frame.io V4 share links in the Reel preview", () => {
  const url =
    "https://next.frame.io/share/share-id/view/asset-id";

  assert.deepEqual(resolveReviewMediaLink(url), {
    provider: "frame-io",
    providerLabel: "Frame.io",
    openUrl: url,
    previewUrl: url,
  });
});

test("builds a local thumbnail URL for Frame.io V4 share assets", () => {
  const url =
    "https://next.frame.io/share/share-id/view/asset-id?utm_source=portal";

  assert.deepEqual(extractFrameIoV4ShareParts(url), {
    shareId: "share-id",
    assetId: "asset-id",
  });
  assert.equal(
    frameIoThumbnailUrl(url),
    "/api/frame-io/thumbnail?shareId=share-id&assetId=asset-id",
  );
  assert.equal(
    frameIoPlaybackUrl(url),
    "/api/frame-io/media?shareId=share-id&assetId=asset-id",
  );
});

test("does not build thumbnails for legacy or malformed Frame.io links", () => {
  assert.equal(frameIoThumbnailUrl("https://f.io/_aBcDeF"), null);
  assert.equal(frameIoPlaybackUrl("https://f.io/_aBcDeF"), null);
  assert.equal(
    frameIoThumbnailUrl("https://next.frame.io/share/share-id"),
    null,
  );
  assert.equal(
    extractFrameIoV4ShareParts(
      "https://next.frame.io/share/share-id/view/%2Fetc%2Fpasswd",
    ),
    null,
  );
});

test("keeps Google Drive previews and rejects lookalike Frame.io domains", () => {
  const drive = resolveReviewMediaLink(
    "https://drive.google.com/file/d/abc123/view",
  );

  assert.equal(drive?.provider, "google-drive");
  assert.equal(drive?.previewUrl, "https://drive.google.com/file/d/abc123/preview");
  assert.equal(isFrameIoUrl("https://frame.io.evil.example/share/abc"), false);
  assert.equal(resolveReviewMediaLink("https://example.com/video"), null);
});
