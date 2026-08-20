export const SOCIAL_POST_FORMATS = ["reel", "carousel", "image"] as const;

export type SocialPostFormat = (typeof SOCIAL_POST_FORMATS)[number];

export const SOCIAL_POST_FORMAT_LABELS: Record<SocialPostFormat, string> = {
  reel: "Reel",
  carousel: "Carousel",
  image: "Image",
};

export const SOCIAL_POST_STATUSES = [
  "not_started",
  "in_progress",
  "for_review",
  "internal_approved",
  "external_approved",
  "scheduled",
  "changes_requested",
  "posted",
] as const;

export type SocialPostStatus = (typeof SOCIAL_POST_STATUSES)[number];

export const SOCIAL_POST_STATUS_LABELS: Record<SocialPostStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  for_review: "Awaiting approvals",
  internal_approved: "Internal approved",
  external_approved: "External approved",
  scheduled: "Scheduled",
  changes_requested: "Changes requested",
  posted: "Posted",
};

export function normalizeSocialPostStatus(value: unknown): SocialPostStatus {
  if (value === "approved") return "internal_approved";
  if (value === "needs_revision") return "changes_requested";
  return typeof value === "string" &&
    SOCIAL_POST_STATUSES.includes(value as SocialPostStatus)
    ? (value as SocialPostStatus)
    : "not_started";
}

export type ReelDetails = {
  hook: string;
  script: string;
  cta: string;
  videoUrl: string;
  footageLinks: string[];
  referenceLinks: string[];
};

export const EMPTY_REEL_DETAILS: ReelDetails = {
  hook: "",
  script: "",
  cta: "",
  videoUrl: "",
  footageLinks: [],
  referenceLinks: [],
};

export type SocialResearchEntry = {
  id: string;
  division_task_id: string;
  reference_link: string;
  format: SocialPostFormat;
  hook: string;
  storytelling_approach: string;
  used_trending_audio: boolean;
  audio_name: string | null;
  views: number | null;
  engagement_rate: number | null;
  hook_types: SocialHookType[];
  hook_explanation: string;
  content_type: SocialContentType | null;
  why_it_worked: string;
  cta: string | null;
  created_at: string;
};

export const SOCIAL_HOOK_TYPES = [
  "text_hook",
  "visual_hook",
  "audio_hook",
] as const;

export type SocialHookType = (typeof SOCIAL_HOOK_TYPES)[number];

export const SOCIAL_HOOK_TYPE_LABELS: Record<SocialHookType, string> = {
  text_hook: "Text hook",
  visual_hook: "Visual hook",
  audio_hook: "Audio hook",
};

export const SOCIAL_CONTENT_TYPES = [
  "educational",
  "entertaining",
  "authority",
  "inspirational",
  "relatable",
  "promotional",
] as const;

export type SocialContentType = (typeof SOCIAL_CONTENT_TYPES)[number];

export const SOCIAL_CONTENT_TYPE_LABELS: Record<SocialContentType, string> = {
  educational: "Educational",
  entertaining: "Entertaining",
  authority: "Authority",
  inspirational: "Inspirational",
  relatable: "Relatable",
  promotional: "Promotional",
};

export const PROJECT_ASSIGNEES = [
  "Karen",
  "Adrian",
  "Arion",
  "Sure",
  "Emilia",
  "Xiyangcen",
  "Bruno",
] as const;

export function isSocialPostFormat(
  value: unknown,
): value is SocialPostFormat {
  return (
    typeof value === "string" &&
    SOCIAL_POST_FORMATS.includes(value as SocialPostFormat)
  );
}

export function isSocialHookType(value: unknown): value is SocialHookType {
  return (
    typeof value === "string" &&
    SOCIAL_HOOK_TYPES.includes(value as SocialHookType)
  );
}

export function isSocialContentType(
  value: unknown,
): value is SocialContentType {
  return (
    typeof value === "string" &&
    SOCIAL_CONTENT_TYPES.includes(value as SocialContentType)
  );
}

export function resolveInstagramEmbedUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl.trim());
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (hostname !== "instagram.com") return null;

    const match = url.pathname.match(/^\/(p|reel|tv)\/([^/]+)/i);
    if (!match) return null;

    return `https://www.instagram.com/${match[1].toLowerCase()}/${encodeURIComponent(
      match[2],
    )}/embed/`;
  } catch {
    return null;
  }
}

export function normalizeReelDetails(value: unknown): ReelDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...EMPTY_REEL_DETAILS };
  }

  const record = value as Record<string, unknown>;
  return {
    hook: typeof record.hook === "string" ? record.hook : "",
    script: typeof record.script === "string" ? record.script : "",
    cta: typeof record.cta === "string" ? record.cta : "",
    videoUrl: typeof record.videoUrl === "string" ? record.videoUrl : "",
    footageLinks: Array.isArray(record.footageLinks)
      ? record.footageLinks.filter(
          (link): link is string => typeof link === "string" && link.trim() !== "",
        )
      : [],
    referenceLinks: Array.isArray(record.referenceLinks)
      ? record.referenceLinks.filter(
          (link): link is string => typeof link === "string" && link.trim() !== "",
        )
      : [],
  };
}

export function normalizeSocialResearchEntries(
  value: unknown,
): SocialResearchEntry[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const record = entry as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.reference_link !== "string"
    ) {
      return [];
    }

    return [
      {
        id: record.id,
        division_task_id:
          typeof record.division_task_id === "string"
            ? record.division_task_id
            : "",
        reference_link: record.reference_link,
        format: isSocialPostFormat(record.format)
          ? record.format
          : "carousel",
        hook: typeof record.hook === "string" ? record.hook : "",
        storytelling_approach:
          typeof record.storytelling_approach === "string"
            ? record.storytelling_approach
            : "",
        used_trending_audio: record.used_trending_audio === true,
        audio_name:
          typeof record.audio_name === "string" ? record.audio_name : null,
        views:
          typeof record.views === "number" && Number.isFinite(record.views)
            ? record.views
            : null,
        engagement_rate:
          typeof record.engagement_rate === "number" &&
          Number.isFinite(record.engagement_rate)
            ? record.engagement_rate
            : null,
        hook_types: Array.isArray(record.hook_types)
          ? record.hook_types.filter(isSocialHookType)
          : [],
        hook_explanation:
          typeof record.hook_explanation === "string"
            ? record.hook_explanation
            : "",
        content_type: isSocialContentType(record.content_type)
          ? record.content_type
          : null,
        why_it_worked:
          typeof record.why_it_worked === "string"
            ? record.why_it_worked
            : "",
        cta: typeof record.cta === "string" ? record.cta : null,
        created_at:
          typeof record.created_at === "string" ? record.created_at : "",
      },
    ];
  });
}
