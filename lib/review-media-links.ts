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
      previewUrl: null,
    };
  }

  return null;
}
