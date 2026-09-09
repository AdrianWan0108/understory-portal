const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SOCIAL_POST_ROUTE = "/team-hub/social-media-calendar";

export type SocialPostLinkTarget = {
  id: string;
  title: string;
};

export function socialPostTitleSlug(title: string) {
  const slug = title
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/\p{Mark}/gu, "")
    .replace(/[’']/g, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return Array.from(slug).slice(0, 60).join("").replace(/-+$/g, "") || "post";
}

export function socialPostIdToToken(id: string) {
  if (!UUID_PATTERN.test(id)) {
    throw new Error("Social post IDs must be UUIDs.");
  }

  const bytes = id
    .replaceAll("-", "")
    .match(/.{2}/g)!
    .map((pair) => String.fromCharCode(Number.parseInt(pair, 16)))
    .join("");

  return btoa(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

export function socialPostTokenToId(token: string) {
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return null;

  try {
    const encoded = token.replaceAll("-", "+").replaceAll("_", "/") + "==";
    const binary = atob(encoded);
    if (binary.length !== 16) return null;

    const hex = Array.from(binary, (character) =>
      character.charCodeAt(0).toString(16).padStart(2, "0"),
    ).join("");

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return null;
  }
}

export function socialPostPathSegment(post: SocialPostLinkTarget) {
  return socialPostTitleSlug(post.title);
}

export function legacySocialPostPathSegment(post: SocialPostLinkTarget) {
  return `${socialPostTitleSlug(post.title)}--${socialPostIdToToken(post.id)}`;
}

export function socialPostHref(post: SocialPostLinkTarget) {
  return `${SOCIAL_POST_ROUTE}/${socialPostPathSegment(post)}`;
}

export function absoluteSocialPostUrl(
  origin: string,
  post: SocialPostLinkTarget,
) {
  return new URL(socialPostHref(post), origin).toString();
}

export function socialPostIdFromPathSegment(segment: string) {
  const separatorIndex = segment.lastIndexOf("--");
  if (separatorIndex < 1) return null;
  return socialPostTokenToId(segment.slice(separatorIndex + 2));
}
