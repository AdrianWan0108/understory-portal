export function googleSlidesEmbedUrl(link: string) {
  try {
    const url = new URL(link);
    const isGoogleHost =
      url.hostname === "docs.google.com" ||
      url.hostname.endsWith(".docs.google.com");
    if (!isGoogleHost) return null;

    const presentationMatch = url.pathname.match(
      /\/presentation\/d\/(e\/)?([^/?#]+)/,
    );
    if (!presentationMatch) return null;

    const publishedPrefix = presentationMatch[1] ?? "";
    const presentationId = presentationMatch[2];
    return `https://docs.google.com/presentation/d/${publishedPrefix}${presentationId}/embed?start=false&loop=false&delayms=3000`;
  } catch {
    return null;
  }
}

export function loomEmbedUrl(link: string | null) {
  if (!link) return null;

  try {
    const url = new URL(link);
    const isLoomHost =
      url.hostname === "loom.com" || url.hostname.endsWith(".loom.com");
    if (!isLoomHost) return null;

    const videoId = url.pathname.match(/\/(?:share|embed)\/([^/?#]+)/)?.[1];
    return videoId ? `https://www.loom.com/embed/${videoId}` : null;
  } catch {
    return null;
  }
}
