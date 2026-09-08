export function extractGoogleDriveFileId(value: string) {
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "drive.google.com" && hostname !== "docs.google.com") {
      return null;
    }

    const pathMatch = url.pathname.match(/\/d\/([^/]+)/);
    return pathMatch?.[1] ?? url.searchParams.get("id");
  } catch {
    return null;
  }
}

export function resolveGoogleDriveFileUrls(value: string) {
  const fileId = extractGoogleDriveFileId(value);
  if (!fileId) return null;

  const encodedId = encodeURIComponent(fileId);
  return {
    previewUrl: `https://drive.google.com/file/d/${encodedId}/preview`,
    openUrl: `https://drive.google.com/file/d/${encodedId}/view`,
  };
}

export type ReviewMediaLink = {
  provider: "google-drive" | "frame-io";
  providerLabel: "Google Drive" | "Frame.io";
  openUrl: string;
  previewUrl: string | null;
};

export type FrameIoV4ShareParts = {
  shareId: string;
  assetId: string;
};

const FRAME_IO_SHARE_PART_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;

function frameIoUrl(value: string) {
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    const isFrameIoHost =
      hostname === "f.io" ||
      hostname === "frame.io" ||
      hostname.endsWith(".frame.io");

    return url.protocol === "https:" && isFrameIoHost ? url : null;
  } catch {
    return null;
  }
}

function frameIoPreviewUrl(url: URL) {
  const hostname = url.hostname.toLowerCase();
  const isV4Share =
    hostname === "next.frame.io" && url.pathname.startsWith("/share/");

  return isV4Share ? url.toString() : null;
}

export function extractFrameIoV4ShareParts(
  value: string,
): FrameIoV4ShareParts | null {
  const url = frameIoUrl(value);
  if (!url || url.hostname.toLowerCase() !== "next.frame.io") return null;

  const match = url.pathname.match(/^\/share\/([^/]+)\/view\/([^/]+)\/?$/);
  if (!match) return null;

  const [, shareId, assetId] = match;
  if (
    !FRAME_IO_SHARE_PART_PATTERN.test(shareId) ||
    !FRAME_IO_SHARE_PART_PATTERN.test(assetId)
  ) {
    return null;
  }

  return { shareId, assetId };
}

export function frameIoThumbnailUrl(value: string) {
  const parts = extractFrameIoV4ShareParts(value);
  if (!parts) return null;

  const query = new URLSearchParams(parts);
  return `/api/frame-io/thumbnail?${query.toString()}`;
}

export function frameIoPlaybackUrl(value: string) {
  const parts = extractFrameIoV4ShareParts(value);
  if (!parts) return null;

  const query = new URLSearchParams(parts);
  return `/api/frame-io/media?${query.toString()}`;
}

export function isFrameIoUrl(value: string) {
  return Boolean(frameIoUrl(value));
}

export function resolveReviewMediaLink(value: string): ReviewMediaLink | null {
  const googleDriveUrls = resolveGoogleDriveFileUrls(value);
  if (googleDriveUrls) {
    return {
      provider: "google-drive",
      providerLabel: "Google Drive",
      openUrl: googleDriveUrls.openUrl,
      previewUrl: googleDriveUrls.previewUrl,
    };
  }

  const frameIo = frameIoUrl(value);
  if (frameIo) {
    return {
      provider: "frame-io",
      providerLabel: "Frame.io",
      openUrl: frameIo.toString(),
      previewUrl: frameIoPreviewUrl(frameIo),
    };
  }

  return null;
}
