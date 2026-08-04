export function extractGalleryDriveFileId(
  value: string | null | undefined,
) {
  if (!value) return null;

  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "drive.google.com" && hostname !== "docs.google.com") {
      return null;
    }

    return (
      url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ??
      url.searchParams.get("id")
    );
  } catch {
    return null;
  }
}

export function galleryImagePreviewUrl(
  value: string | null | undefined,
  width = 1200,
) {
  if (!value) return null;
  const fileId = extractGalleryDriveFileId(value);
  return fileId
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${width}`
    : value;
}

export function galleryImageDownloadUrl(
  value: string | null | undefined,
) {
  if (!value) return null;
  const fileId = extractGalleryDriveFileId(value);
  if (!fileId) return value;

  const downloadUrl = new URL("https://drive.google.com/uc");
  downloadUrl.searchParams.set("export", "download");
  downloadUrl.searchParams.set("id", fileId);

  try {
    const sourceUrl = new URL(value);
    const resourceKey = sourceUrl.searchParams.get("resourcekey");
    if (resourceKey) downloadUrl.searchParams.set("resourcekey", resourceKey);
  } catch {
    // The Drive file ID was already resolved, so the standard link is enough.
  }

  return downloadUrl.toString();
}
