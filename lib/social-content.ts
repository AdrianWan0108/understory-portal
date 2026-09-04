export const SOCIAL_POST_FORMATS = [
  "reel",
  "carousel",
  "image",
  "story",
] as const;

export type SocialPostFormat = (typeof SOCIAL_POST_FORMATS)[number];

export const SOCIAL_POST_FORMAT_LABELS: Record<SocialPostFormat, string> = {
  reel: "Reel",
  carousel: "Carousel",
  image: "Image",
  story: "Story",
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
  external_approved: "Client approved",
  scheduled: "Scheduled",
  changes_requested: "Changes requested",
  posted: "Posted",
};

export const SOCIAL_REQUIRED_CLIENT_REVIEWER_KEYS_BY_SLUG = {
  mvp: ["MVP_Gary"],
  boardwalk: ["Boardwalk_Sarah"],
} as const satisfies Record<string, readonly string[]>;

export function requiredSocialClientReviewerKeys(
  clientSlug: string | null | undefined,
): string[] {
  if (!clientSlug) return [];
  return [
    ...(SOCIAL_REQUIRED_CLIENT_REVIEWER_KEYS_BY_SLUG[
      clientSlug as keyof typeof SOCIAL_REQUIRED_CLIENT_REVIEWER_KEYS_BY_SLUG
    ] ?? []),
  ];
}

export function normalizeSocialPostStatus(value: unknown): SocialPostStatus {
  if (value === "approved") return "internal_approved";
  if (value === "needs_revision") return "changes_requested";
  return typeof value === "string" &&
    SOCIAL_POST_STATUSES.includes(value as SocialPostStatus)
    ? (value as SocialPostStatus)
    : "not_started";
}

export const SOCIAL_PRODUCTION_STATUSES = [
  "not_started",
  "in_progress",
  "ready_for_review",
  "changes_required",
  "complete",
] as const;

export type SocialProductionStatus =
  (typeof SOCIAL_PRODUCTION_STATUSES)[number];

export const SOCIAL_PRODUCTION_STATUS_LABELS: Record<
  SocialProductionStatus,
  string
> = {
  not_started: "Not started",
  in_progress: "In production",
  ready_for_review: "Ready for review",
  changes_required: "Changes required",
  complete: "Complete",
};

export const SOCIAL_PUBLISHING_STATUSES = [
  "unscheduled",
  "scheduled",
  "posted",
] as const;

export type SocialPublishingStatus =
  (typeof SOCIAL_PUBLISHING_STATUSES)[number];

export const SOCIAL_PUBLISHING_STATUS_LABELS: Record<
  SocialPublishingStatus,
  string
> = {
  unscheduled: "Unscheduled",
  scheduled: "Scheduled",
  posted: "Posted",
};

export const SOCIAL_SCHEDULING_MODES = ["automatic", "manual"] as const;

export type SocialSchedulingMode = (typeof SOCIAL_SCHEDULING_MODES)[number];

export const SOCIAL_SCHEDULING_MODE_LABELS: Record<
  SocialSchedulingMode,
  string
> = {
  automatic: "Automatic publishing (Meta)",
  manual: "Manual post with Slack reminder",
};

export function normalizeSocialSchedulingMode(
  value: unknown,
): SocialSchedulingMode {
  return typeof value === "string" &&
    SOCIAL_SCHEDULING_MODES.includes(value as SocialSchedulingMode)
    ? (value as SocialSchedulingMode)
    : "automatic";
}

export type SocialReviewDecision = {
  status: "approved" | "pending" | "changes";
  reviewed_at?: string;
  reviewer_name?: string;
  comment?: string;
};

export type SocialApprovalState =
  | "not_submitted"
  | "not_sent"
  | "pending"
  | "approved"
  | "changes_requested";

export type ProductionTransition =
  | "start_production"
  | "submit_internal_review"
  | "request_internal_changes"
  | "complete_internal_review"
  | "request_client_changes"
  | "resubmit_after_changes";

export type PublishingTransition =
  | "confirm_scheduled"
  | "mark_posted"
  | "restore_posted";

export function normalizeSocialProductionStatus(
  value: unknown,
  legacyStatus?: unknown,
): SocialProductionStatus {
  if (
    typeof value === "string" &&
    SOCIAL_PRODUCTION_STATUSES.includes(value as SocialProductionStatus)
  ) {
    return value as SocialProductionStatus;
  }

  switch (normalizeSocialPostStatus(legacyStatus)) {
    case "in_progress":
      return "in_progress";
    case "for_review":
      return "ready_for_review";
    case "changes_requested":
      return "changes_required";
    case "internal_approved":
    case "external_approved":
    case "scheduled":
    case "posted":
      return "complete";
    default:
      return "not_started";
  }
}

export function normalizeSocialPublishingStatus(
  value: unknown,
  legacyStatus?: unknown,
  postedAt?: unknown,
): SocialPublishingStatus {
  if (postedAt || normalizeSocialPostStatus(legacyStatus) === "posted") {
    return "posted";
  }
  if (
    typeof value === "string" &&
    SOCIAL_PUBLISHING_STATUSES.includes(value as SocialPublishingStatus)
  ) {
    return value as SocialPublishingStatus;
  }
  return normalizeSocialPostStatus(legacyStatus) === "scheduled"
    ? "scheduled"
    : "unscheduled";
}

export function normalizeSocialReviews(
  value: unknown,
): Record<string, SocialReviewDecision> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      if (
        record.status !== "approved" &&
        record.status !== "pending" &&
        record.status !== "changes"
      ) {
        return [];
      }
      return [
        [
          key,
          {
            status: record.status,
            reviewed_at:
              typeof record.reviewed_at === "string"
                ? record.reviewed_at
                : undefined,
            reviewer_name:
              typeof record.reviewer_name === "string"
                ? record.reviewer_name
                : undefined,
            comment:
              typeof record.comment === "string" ? record.comment : undefined,
          },
        ],
      ];
    }),
  );
}

function deriveSubmittedApprovalState(
  reviewsValue: unknown,
  requiredReviewerKeys: string[],
  emptyState: "not_submitted" | "not_sent",
  wasSubmitted: boolean,
): SocialApprovalState {
  if (!wasSubmitted) return emptyState;
  const reviews = normalizeSocialReviews(reviewsValue);
  if (Object.values(reviews).some((review) => review.status === "changes")) {
    return "changes_requested";
  }
  const decisions =
    requiredReviewerKeys.length > 0
      ? requiredReviewerKeys.map((key) => reviews[key]?.status ?? "pending")
      : Object.values(reviews).map((review) => review.status);
  return decisions.length > 0 &&
    decisions.every((decision) => decision === "approved")
    ? "approved"
    : "pending";
}

export function deriveInternalApprovalState(
  reviews: unknown,
  requiredReviewerKeys: string[],
  submittedAt: unknown,
): SocialApprovalState {
  return deriveSubmittedApprovalState(
    reviews,
    requiredReviewerKeys,
    "not_submitted",
    Boolean(submittedAt),
  );
}

export function deriveClientApprovalState(
  reviews: unknown,
  requiredReviewerKeys: string[],
  sentAt: unknown,
): SocialApprovalState {
  return deriveSubmittedApprovalState(
    reviews,
    requiredReviewerKeys,
    "not_sent",
    Boolean(sentAt),
  );
}

export function reconcileSocialProductionStatus(
  current: SocialProductionStatus,
  sentToClientAt: unknown,
  clientReviews: unknown,
): SocialProductionStatus {
  const reviews = normalizeSocialReviews(clientReviews);
  if (Object.values(reviews).some((review) => review.status === "changes")) {
    return "changes_required";
  }
  return sentToClientAt ? "complete" : current;
}

export function productionStatusAfterTransition(
  current: SocialProductionStatus,
  transition: ProductionTransition,
): SocialProductionStatus {
  switch (transition) {
    case "start_production":
      return "in_progress";
    case "submit_internal_review":
    case "resubmit_after_changes":
      return "ready_for_review";
    case "request_internal_changes":
    case "request_client_changes":
      return "changes_required";
    case "complete_internal_review":
      return "complete";
    default:
      return current;
  }
}

export function publishingStatusAfterTransition(
  current: SocialPublishingStatus,
  transition: PublishingTransition,
): SocialPublishingStatus {
  switch (transition) {
    case "confirm_scheduled":
    case "restore_posted":
      return "scheduled";
    case "mark_posted":
      return "posted";
    default:
      return current;
  }
}

export function canScheduleSocialPost(input: {
  scheduledAt: unknown;
  sentToClientAt: unknown;
  clientApprovalState: SocialApprovalState;
}) {
  return (
    Boolean(input.scheduledAt) &&
    Boolean(input.sentToClientAt) &&
    input.clientApprovalState === "approved"
  );
}

export function legacyStatusForSocialDimensions(
  productionStatus: SocialProductionStatus,
  publishingStatus: SocialPublishingStatus,
  clientApprovalState?: SocialApprovalState,
): SocialPostStatus {
  if (publishingStatus === "posted") return "posted";
  if (publishingStatus === "scheduled") return "scheduled";
  if (productionStatus === "changes_required") return "changes_requested";
  if (clientApprovalState === "approved") return "external_approved";
  if (productionStatus === "complete") return "internal_approved";
  if (productionStatus === "ready_for_review") return "for_review";
  return productionStatus === "in_progress" ? "in_progress" : "not_started";
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

export type SocialFilmingDetails = {
  filmingDate: string;
  participants: string[];
  needsModels: boolean;
  preparation: string;
  script: string;
  shotList: string;
  rawFootageLinks: string[];
  filmed: boolean;
};

export const EMPTY_SOCIAL_FILMING_DETAILS: SocialFilmingDetails = {
  filmingDate: "",
  participants: [],
  needsModels: false,
  preparation: "",
  script: "",
  shotList: "",
  rawFootageLinks: [],
  filmed: false,
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

export function normalizeSocialFilmingDetails(
  value: unknown,
  reelDetailsValue?: unknown,
): SocialFilmingDetails {
  const reelDetails = normalizeReelDetails(reelDetailsValue);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ...EMPTY_SOCIAL_FILMING_DETAILS,
      script: reelDetails.script,
      rawFootageLinks: reelDetails.footageLinks,
    };
  }
  const record = value as Record<string, unknown>;
  return {
    filmingDate:
      typeof record.filmingDate === "string" ? record.filmingDate : "",
    participants: Array.isArray(record.participants)
      ? record.participants.filter(
          (participant): participant is string =>
            typeof participant === "string" && participant.trim() !== "",
        )
      : [],
    needsModels: record.needsModels === true,
    preparation:
      typeof record.preparation === "string" ? record.preparation : "",
    script:
      typeof record.script === "string" ? record.script : reelDetails.script,
    shotList:
      typeof record.shotList === "string" ? record.shotList : "",
    rawFootageLinks: Array.isArray(record.rawFootageLinks)
      ? record.rawFootageLinks.filter(
          (link): link is string => typeof link === "string" && link.trim() !== "",
        )
      : reelDetails.footageLinks,
    filmed: record.filmed === true,
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
