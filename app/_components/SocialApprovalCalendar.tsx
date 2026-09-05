"use client";

import { Fraunces } from "next/font/google";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  extractGoogleDriveFileId,
  resolveGoogleDriveFileUrls,
} from "@/lib/google-drive";
import { sendSlackNotification } from "@/lib/slack-notifications";
import {
  canScheduleSocialPost,
  deriveClientApprovalState,
  deriveInternalApprovalState,
  legacyStatusForSocialDimensions,
  normalizeReelDetails,
  normalizeSocialFilmingDetails,
  normalizeSocialPostStatus,
  normalizeSocialProductionStatus,
  normalizeSocialPublishingStatus,
  normalizeSocialSchedulingMode,
  normalizeStoryInteraction,
  productionStatusAfterTransition,
  publishingStatusAfterTransition,
  reconcileSocialProductionStatus,
  requiredSocialClientReviewerKeys,
  SOCIAL_PRODUCTION_STATUS_LABELS,
  SOCIAL_PRODUCTION_STATUSES,
  SOCIAL_PUBLISHING_STATUS_LABELS,
  SOCIAL_SCHEDULING_MODE_LABELS,
  SOCIAL_SCHEDULING_MODES,
  SOCIAL_POST_STATUS_LABELS,
  STORY_INTERACTION_TYPE_LABELS,
  STORY_INTERACTION_TYPES,
  type ReelDetails,
  type SocialFilmingDetails,
  type SocialProductionStatus,
  type SocialPublishingStatus,
  type SocialSchedulingMode,
  type SocialPostStatus,
  type StoryInteraction,
} from "@/lib/social-content";
import {
  parseSocialContentImport,
  SOCIAL_CONTENT_IMPORT_EXAMPLE,
} from "@/lib/social-content-import";
import { supabase } from "@/lib/supabase";
import { TEAM_IDENTITIES } from "@/lib/team-auth";
import { readTeamSessionProfile } from "@/app/team-hub/_components/TeamIdentity";
import { isWorkspaceClientSlug } from "@/lib/workspace-clients";

const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

export type ApprovalReviewer = {
  key: string;
  name: string;
  role: string;
  initials: string;
};

type ReviewStatus = "approved" | "pending" | "changes";

type ReviewDecision = {
  status: ReviewStatus;
  reviewed_at?: string;
  reviewer_name?: string;
  comment?: string;
};

type ApprovalHistoryEntry = {
  stage: "internal" | "client";
  reviewer_key: string;
  reviewer_name: string;
  status: Exclude<ReviewStatus, "pending">;
  at: string;
  note?: string;
};

type Slide = {
  id: string;
  slide_number: number;
  on_screen_text: string;
  visual_note: string;
  slide_caption: string | null;
  warning_flag: string | null;
  image_url: string | null;
  slide_references: Array<{
    id: string;
    url: string;
    platform: string;
  }>;
};

type ApprovalPost = {
  id: string;
  client_id: string;
  division_task_id: string | null;
  title: string;
  status: SocialPostStatus;
  production_status: SocialProductionStatus;
  publishing_status: SocialPublishingStatus;
  format: string | null;
  brief: string;
  visual_note: string | null;
  story_interaction: StoryInteraction;
  reel_details: ReelDetails;
  post_caption: string;
  purpose: string | null;
  content_pillar: string | null;
  platform: string | null;
  target_audience: string | null;
  cta: string | null;
  start_date: string | null;
  due_date: string | null;
  scheduled_at: string | null;
  internal_review_submitted_at: string | null;
  internal_approvals: Record<string, ReviewDecision>;
  client_approvals: Record<string, ReviewDecision>;
  approval_history: ApprovalHistoryEntry[];
  final_confirmed: boolean;
  final_confirmed_by: string | null;
  final_confirmed_at: string | null;
  sent_to_client_at: string | null;
  sent_to_client_by: string | null;
  posted_at: string | null;
  posted_by: string | null;
  assigned_to: string | null;
  assignee_usernames: string[];
  watcher_usernames: string[];
  mentioned_usernames: string[];
  requires_filming: boolean;
  filming_details: SocialFilmingDetails;
  creative_drive_link: string | null;
  live_post_url: string | null;
  scheduling_mode: SocialSchedulingMode;
  manual_reminder_sent_at: string | null;
  task_slides: Slide[];
};

type TaskRow = Omit<
  ApprovalPost,
  | "status"
  | "production_status"
  | "publishing_status"
  | "internal_approvals"
  | "client_approvals"
  | "approval_history"
  | "reel_details"
  | "story_interaction"
  | "filming_details"
  | "scheduling_mode"
  | "assignee_usernames"
  | "task_slides"
> & {
  status: unknown;
  production_status: unknown;
  publishing_status: unknown;
  internal_approvals: unknown;
  client_approvals: unknown;
  approval_history: unknown;
  reel_details: unknown;
  story_interaction: unknown;
  filming_details: unknown;
  scheduling_mode: unknown;
  assignee_usernames: string[] | null;
  task_slides: Slide[] | null;
};

type Props = {
  mode: "internal" | "client";
  clientSlug?: "mvp" | "boardwalk" | null;
  clientName?: string | null;
  workspaceId?: string;
  currentReviewer: ApprovalReviewer | null;
  requiredReviewers: ApprovalReviewer[];
  canSendToClient?: boolean;
};

type PostContentDraft = {
  title: string;
  format: string;
  platform: string;
  purpose: string;
  contentPillar: string;
  targetAudience: string;
  cta: string;
  dueDate: string;
  brief: string;
  visualNote: string;
  storyInteraction: StoryInteraction;
  productionStatus: SocialProductionStatus;
  reelDetails: ReelDetails;
  requiresFilming: boolean;
  filmingDetails: SocialFilmingDetails;
  creativeDriveLink: string;
  livePostUrl: string;
  schedulingMode: SocialSchedulingMode;
  assigneeUsernames: string[];
};

type ModalPhase =
  | "planning"
  | "creative"
  | "production"
  | "approval"
  | "scheduling"
  | "publishing";

const MODAL_PHASES: Array<{ value: ModalPhase; label: string }> = [
  { value: "planning", label: "1. Planning" },
  { value: "creative", label: "2. Creative" },
  { value: "production", label: "3. Production & assignment" },
  { value: "approval", label: "4. Review & approval" },
  { value: "scheduling", label: "5. Scheduling" },
  { value: "publishing", label: "6. Publishing" },
];

function workflowPhaseForPost(
  post: ApprovalPost,
  clientReviewerKeys: string[],
): ModalPhase {
  if (
    Boolean(post.live_post_url?.trim()) ||
    post.publishing_status === "scheduled" ||
    post.publishing_status === "posted"
  ) {
    return "publishing";
  }

  if (
    deriveClientApprovalState(
      post.client_approvals,
      clientReviewerKeys,
      post.sent_to_client_at,
    ) === "approved"
  ) {
    return "scheduling";
  }

  if (post.production_status === "changes_required") return "production";

  if (
    post.sent_to_client_at ||
    post.internal_review_submitted_at ||
    post.production_status === "ready_for_review" ||
    post.production_status === "complete"
  ) {
    return "approval";
  }

  if (post.requires_filming && !post.filming_details.filmed) {
    return "production";
  }

  if (post.production_status === "in_progress") return "creative";
  return "planning";
}

const reviewStyles: Record<
  ReviewStatus,
  { label: string; pill: string; dot: string }
> = {
  approved: {
    label: "Approved",
    pill: "bg-[#EAF5ED] text-[#356346]",
    dot: "bg-[#4F8A62]",
  },
  pending: {
    label: "Not yet reviewed",
    pill: "bg-[#F4EFE5] text-[#806944]",
    dot: "bg-[#B18C4C]",
  },
  changes: {
    label: "Changes requested",
    pill: "bg-[#F4E7E2] text-[#875344]",
    dot: "bg-[#B16954]",
  },
};

const workflowStyles: Record<
  SocialPostStatus,
  { label: string; pill: string; dot: string }
> = {
  not_started: {
    label: SOCIAL_POST_STATUS_LABELS.not_started,
    pill: "bg-[#F5F2F6] text-[#695E70]",
    dot: "bg-[#9A8FA0]",
  },
  in_progress: {
    label: SOCIAL_POST_STATUS_LABELS.in_progress,
    pill: "bg-[#FFF4D2] text-[#7B5A08]",
    dot: "bg-[#D3A72B]",
  },
  for_review: {
    label: SOCIAL_POST_STATUS_LABELS.for_review,
    pill: "bg-[#EDF2FF] text-[#405A91]",
    dot: "bg-[#6683C1]",
  },
  internal_approved: {
    label: SOCIAL_POST_STATUS_LABELS.internal_approved,
    pill: "bg-[#F3EAF8] text-[#654277]",
    dot: "bg-[#8B5AA3]",
  },
  external_approved: {
    label: SOCIAL_POST_STATUS_LABELS.external_approved,
    pill: "bg-[#EDF7F0] text-[#477156]",
    dot: "bg-[#669B78]",
  },
  scheduled: {
    label: SOCIAL_POST_STATUS_LABELS.scheduled,
    pill: "bg-[#E8F4F7] text-[#2F6470]",
    dot: "bg-[#4E8793]",
  },
  changes_requested: {
    label: SOCIAL_POST_STATUS_LABELS.changes_requested,
    pill: "bg-[#F8ECE8] text-[#854D43]",
    dot: "bg-[#B16954]",
  },
  posted: {
    label: SOCIAL_POST_STATUS_LABELS.posted,
    pill: "bg-[#F0EDF2] text-[#514758]",
    dot: "bg-[#756B7B]",
  },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const INTERNAL_REVIEWER_KEYS = ["Understory_Karen"];

function isReviewStatus(value: unknown): value is ReviewStatus {
  return value === "approved" || value === "pending" || value === "changes";
}

function normalizeReviews(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, ReviewDecision>;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      if (!isReviewStatus(record.status)) return [];
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

function normalizeHistory(value: unknown): ApprovalHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (
      (record.stage !== "internal" && record.stage !== "client") ||
      (record.status !== "approved" && record.status !== "changes") ||
      typeof record.reviewer_key !== "string" ||
      typeof record.reviewer_name !== "string" ||
      typeof record.at !== "string"
    ) {
      return [];
    }
    return [
      {
        stage: record.stage,
        reviewer_key: record.reviewer_key,
        reviewer_name: record.reviewer_name,
        status: record.status,
        at: record.at,
        note: typeof record.note === "string" ? record.note : undefined,
      },
    ];
  });
}

function mapPost(row: TaskRow): ApprovalPost {
  const clientApprovals = normalizeReviews(row.client_approvals);
  const productionStatus = reconcileSocialProductionStatus(
    normalizeSocialProductionStatus(row.production_status, row.status),
    row.sent_to_client_at,
    clientApprovals,
  );
  return {
    ...row,
    status: normalizeSocialPostStatus(row.status),
    production_status: productionStatus,
    publishing_status: normalizeSocialPublishingStatus(
      row.publishing_status,
      row.status,
      row.posted_at,
    ),
    scheduling_mode: normalizeSocialSchedulingMode(row.scheduling_mode),
    internal_approvals: normalizeReviews(row.internal_approvals),
    client_approvals: clientApprovals,
    approval_history: normalizeHistory(row.approval_history),
    reel_details: normalizeReelDetails(row.reel_details),
    story_interaction: normalizeStoryInteraction(row.story_interaction),
    filming_details: normalizeSocialFilmingDetails(
      row.filming_details,
      row.reel_details,
    ),
    assignee_usernames: row.assignee_usernames ?? [],
    watcher_usernames: row.watcher_usernames ?? [],
    mentioned_usernames: row.mentioned_usernames ?? [],
    task_slides: [...(row.task_slides ?? [])].sort(
      (a, b) => a.slide_number - b.slide_number,
    ).map((slide) => ({
      ...slide,
      slide_references: slide.slide_references ?? [],
    })),
  };
}

function assigneeDisplayNames(post: ApprovalPost): string[] {
  const usernames =
    post.assignee_usernames.length > 0
      ? post.assignee_usernames
      : post.assigned_to
        ? [post.assigned_to]
        : [];
  return usernames.map((username) => {
    const profile = Object.values(TEAM_IDENTITIES).find(
      (identity) => identity.username === username,
    );
    return profile?.name ?? username;
  });
}

function hasClientChangesRequested(post: ApprovalPost) {
  return Object.values(post.client_approvals).some(
    (review) => review.status === "changes",
  );
}

function reviewFor(
  post: ApprovalPost,
  mode: Props["mode"],
  reviewerKey: string,
): ReviewDecision {
  const reviews =
    mode === "internal" ? post.internal_approvals : post.client_approvals;
  return reviews[reviewerKey] ?? { status: "pending" };
}

function overallStatus(
  post: ApprovalPost,
  mode: Props["mode"],
  reviewers: ApprovalReviewer[],
): ReviewStatus {
  const statuses = reviewers.map(
    (reviewer) => reviewFor(post, mode, reviewer.key).status,
  );
  if (statuses.includes("changes")) return "changes";
  if (statuses.length > 0 && statuses.every((status) => status === "approved")) {
    return "approved";
  }
  return "pending";
}

function approvalDisplayStyle(
  post: ApprovalPost,
  mode: Props["mode"],
  reviewers: ApprovalReviewer[],
  clientReviewerKeys: string[] = [],
) {
  if (post.publishing_status === "posted") return workflowStyles.posted;
  if (post.publishing_status === "scheduled") return workflowStyles.scheduled;
  if (mode !== "internal") {
    return reviewStyles[overallStatus(post, mode, reviewers)];
  }
  const clientState = deriveClientApprovalState(
    post.client_approvals,
    clientReviewerKeys,
    post.sent_to_client_at,
  );
  if (clientState === "approved") return workflowStyles.external_approved;
  if (clientState === "changes_requested") {
    return workflowStyles.changes_requested;
  }
  if (clientState === "pending") return workflowStyles.for_review;
  return workflowStyles[
    post.production_status === "ready_for_review"
      ? "for_review"
      : post.production_status === "changes_required"
        ? "changes_requested"
        : post.production_status === "complete"
          ? "internal_approved"
          : post.production_status
  ];
}

function approvalStatusForReviewerKeys(
  reviews: Record<string, ReviewDecision>,
  reviewerKeys: string[],
): ReviewStatus {
  if (
    Object.values(reviews).some((review) => review.status === "changes")
  ) {
    return "changes";
  }

  const requiredStatuses = reviewerKeys.map(
    (reviewerKey) => reviews[reviewerKey]?.status ?? "pending",
  );
  if (
    requiredStatuses.length > 0 &&
    requiredStatuses.every((status) => status === "approved")
  ) {
    return "approved";
  }

  if (
    reviewerKeys.length === 0 &&
    Object.keys(reviews).length > 0 &&
    Object.values(reviews).every((review) => review.status === "approved")
  ) {
    return "approved";
  }

  return "pending";
}

function isReadyForClient(post: ApprovalPost, reviewers: ApprovalReviewer[]) {
  return (
    overallStatus(post, "internal", reviewers) === "approved" &&
    post.final_confirmed &&
    Boolean(post.scheduled_at)
  );
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "Date not planned";
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime
      ? { hour: "numeric", minute: "2-digit" }
      : {}),
  }).format(new Date(value));
}

function toDateKey(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function statusIcon(status: ReviewStatus) {
  if (status === "approved") return "✓";
  if (status === "changes") return "!";
  return "·";
}

function PostedStamp({ className = "" }: { className?: string }) {
  return (
    <span
      className={`pointer-events-none inline-flex -rotate-6 items-center justify-center rounded-md border-2 border-[#2F8A57]/80 bg-[#EAF7EF]/75 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[#267149] shadow-sm backdrop-blur-[1px] ${className}`}
    >
      Posted
    </span>
  );
}

function formatLabel(format: string | null) {
  if (!format) return "Post";
  return format
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function approvalStateLabel(state: ReturnType<typeof deriveInternalApprovalState>) {
  const labels = {
    not_submitted: "Not submitted",
    not_sent: "Not sent",
    pending: "Pending",
    approved: "Approved",
    changes_requested: "Changes requested",
  } as const;
  return labels[state];
}

function visualPreviewUrl(value: string | null | undefined) {
  if (!value) return null;
  const driveFileId = extractGoogleDriveFileId(value);
  if (driveFileId) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(
      driveFileId,
    )}&sz=w1600`;
  }
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (hostname === "drive.google.com" || hostname === "docs.google.com") {
      return null;
    }
  } catch {
    return null;
  }
  return value;
}

function postVisualPreviewUrl(post: ApprovalPost) {
  return visualPreviewUrl(
    post.format === "reel"
      ? post.reel_details.videoUrl ||
          post.task_slides[0]?.image_url ||
          post.creative_drive_link
      : post.task_slides[0]?.image_url || post.creative_drive_link,
  );
}

export function SocialApprovalCalendar({
  mode,
  clientSlug,
  clientName,
  workspaceId,
  currentReviewer,
  requiredReviewers,
  canSendToClient = false,
}: Props) {
  const [resolvedClientId, setResolvedClientId] = useState<string | null>(null);
  const [resolvedClientName, setResolvedClientName] = useState(
    clientName ?? "Client",
  );
  const [resolvedClientSlug, setResolvedClientSlug] = useState<string | null>(
    clientSlug ?? null,
  );
  const [posts, setPosts] = useState<ApprovalPost[]>([]);
  const [collectionView, setCollectionView] = useState<"active" | "archive">(
    "active",
  );
  const [calendarFilter, setCalendarFilter] = useState<
    | "all"
    | "needs_work"
    | "internal_review"
    | "client_review"
    | "scheduled"
    | "posted"
  >("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [activeModalPhase, setActiveModalPhase] =
    useState<ModalPhase>("planning");
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [captionDraft, setCaptionDraft] = useState("");
  const [slideCaptionDrafts, setSlideCaptionDrafts] = useState<
    Record<string, string>
  >({});
  const [slideTextDrafts, setSlideTextDrafts] = useState<
    Record<string, string>
  >({});
  const [slideVisualDrafts, setSlideVisualDrafts] = useState<
    Record<string, string>
  >({});
  const [slideImageDrafts, setSlideImageDrafts] = useState<
    Record<string, string>
  >({});
  const [slideReferenceDraft, setSlideReferenceDraft] = useState("");
  const [contentDraft, setContentDraft] = useState<PostContentDraft | null>(
    null,
  );
  const [scheduleDraft, setScheduleDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [isRequestingChanges, setIsRequestingChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [postToDelete, setPostToDelete] = useState<ApprovalPost | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importDraft, setImportDraft] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [draggingPostId, setDraggingPostId] = useState<string | null>(null);
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);
  const [syncRevision, setSyncRevision] = useState(0);
  const storyStripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!resolvedClientId) return;
    const channel = supabase
      .channel(
        `social-approval-status-${mode}-${resolvedClientId}-${workspaceId ?? clientSlug ?? "client"}`,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `client_id=eq.${resolvedClientId}`,
        },
        () => setSyncRevision((current) => current + 1),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clientSlug, mode, resolvedClientId, workspaceId]);

  useEffect(() => {
    let isActive = true;

    async function loadPosts() {
      setIsLoading(true);
      setError(null);

      let clientId: string | null = null;
      let nextClientName = clientName ?? "Client";
      let nextClientSlug = clientSlug ?? null;

      if (mode === "internal") {
        if (!workspaceId) {
          setError("This Content Calendar is missing its workspace ID.");
          setIsLoading(false);
          return;
        }

        const { data: workspace, error: workspaceError } = await supabase
          .from("division_tasks")
          .select("id, client_id, title, clients(name, slug)")
          .eq("id", workspaceId)
          .eq("division", "social-media")
          .eq("template_type", "content_calendar")
          .maybeSingle();

        if (!isActive) return;
        if (workspaceError || !workspace) {
          setError(
            `Could not load Content Calendar: ${
              workspaceError?.message ?? "Task not found."
            }`,
          );
          setIsLoading(false);
          return;
        }

        const clientRecord = Array.isArray(workspace.clients)
          ? workspace.clients[0]
          : workspace.clients;
        clientId = workspace.client_id;
        nextClientName = clientRecord?.name ?? "Client";
        nextClientSlug = clientRecord?.slug ?? null;
        setResolvedClientSlug(nextClientSlug);
      } else {
        if (!clientSlug) {
          setError("Choose a client profile to view social approvals.");
          setIsLoading(false);
          return;
        }
        const { data: client, error: clientError } = await supabase
          .from("clients")
          .select("id, name")
          .eq("slug", clientSlug)
          .maybeSingle();

        if (!isActive) return;
        if (clientError || !client) {
          setError(
            `Could not load ${clientName ?? "this client"}: ${
              clientError?.message ?? "Client not found."
            }`,
          );
          setIsLoading(false);
          return;
        }
        clientId = client.id;
        nextClientName = client.name;
        setResolvedClientSlug(clientSlug);
      }

      setResolvedClientId(clientId);
      setResolvedClientName(nextClientName);

      let query = supabase
        .from("tasks")
        .select(
          `
            id,
            client_id,
            division_task_id,
            title,
            status,
            production_status,
            publishing_status,
            scheduling_mode,
            manual_reminder_sent_at,
            format,
            brief,
            visual_note,
            story_interaction,
            reel_details,
            post_caption,
            purpose,
            content_pillar,
            platform,
            target_audience,
            cta,
            start_date,
            due_date,
            scheduled_at,
            internal_review_submitted_at,
            internal_approvals,
            client_approvals,
            approval_history,
            final_confirmed,
            final_confirmed_by,
            final_confirmed_at,
            sent_to_client_at,
            sent_to_client_by,
            posted_at,
            posted_by,
            assigned_to,
            assignee_usernames,
            watcher_usernames,
            mentioned_usernames,
            requires_filming,
            filming_details,
            creative_drive_link,
            live_post_url,
            task_slides (
              id,
              slide_number,
              on_screen_text,
              visual_note,
              slide_caption,
              warning_flag,
              image_url,
              slide_references (
                id,
                url,
                platform
              )
            )
          `,
        )
        .eq("client_id", clientId)
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .order("internal_review_submitted_at", { ascending: true });

      query =
        mode === "internal"
          ? query.eq("division_task_id", workspaceId)
          : query.not("sent_to_client_at", "is", null);

      if (mode === "internal") {
        const teamProfile = readTeamSessionProfile();
        if (teamProfile?.accessLevel === "staff") {
          query = query.or(
            `assignee_usernames.cs.{${teamProfile.username}},mentioned_usernames.cs.{${teamProfile.username}}`,
          );
        }
      }

      const { data, error: postsError } = await query;
      if (!isActive) return;

      if (postsError) {
        setError(`Could not load social approvals: ${postsError.message}`);
        setPosts([]);
      } else {
        const loaded = ((data ?? []) as unknown as TaskRow[]).map(mapPost);
        setPosts(loaded);
        const requestedPostId = new URLSearchParams(window.location.search).get(
          "post",
        );
        const requestedPost = loaded.find((post) => post.id === requestedPostId);
        if (requestedPost) {
          openPost(
            requestedPost,
            requiredSocialClientReviewerKeys(nextClientSlug),
          );
        }
        const firstScheduled = loaded.find((post) => post.scheduled_at);
        if (firstScheduled?.scheduled_at) {
          const date = new Date(firstScheduled.scheduled_at);
          setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
        }
      }
      setIsLoading(false);
    }

    void loadPosts();
    return () => {
      isActive = false;
    };
  }, [clientName, clientSlug, mode, syncRevision, workspaceId]);

  const selectedPost =
    posts.find((post) => post.id === selectedId) ?? null;
  const selectedApprovalHistory =
    selectedPost?.approval_history.filter(
      (entry) => mode === "internal" || entry.stage === "client",
    ) ?? [];
  const clientReviewerKeys = useMemo(
    () => requiredSocialClientReviewerKeys(resolvedClientSlug),
    [resolvedClientSlug],
  );
  const currentWorkflowPhase = selectedPost
    ? workflowPhaseForPost(selectedPost, clientReviewerKeys)
    : "planning";
  const currentWorkflowPhaseOption = MODAL_PHASES.find(
    (phase) => phase.value === currentWorkflowPhase,
  );
  const collectionPosts = posts.filter((post) =>
    collectionView === "archive"
      ? post.publishing_status === "posted"
      : post.publishing_status !== "posted",
  );
  const visiblePosts = collectionPosts.filter((post) => {
    if (calendarFilter === "all") return true;
    if (calendarFilter === "posted") {
      return post.publishing_status === "posted";
    }
    if (calendarFilter === "scheduled") {
      return post.publishing_status === "scheduled";
    }
    if (calendarFilter === "needs_work") {
      return ["not_started", "in_progress", "changes_required"].includes(
        post.production_status,
      );
    }
    if (calendarFilter === "internal_review") {
      return (
        deriveInternalApprovalState(
          post.internal_approvals,
          INTERNAL_REVIEWER_KEYS,
          post.internal_review_submitted_at,
        ) === "pending"
      );
    }
    return (
      deriveClientApprovalState(
        post.client_approvals,
        clientReviewerKeys,
        post.sent_to_client_at,
      ) === "pending"
    );
  });
  const archiveCount = posts.filter(
    (post) => post.publishing_status === "posted",
  ).length;
  const selectedReelVideoUrls =
    selectedPost?.format === "reel"
      ? resolveGoogleDriveFileUrls(
          selectedPost.reel_details.videoUrl ||
            selectedPost.creative_drive_link ||
            "",
        )
      : null;
  const importPreview = useMemo(() => {
    if (!importDraft.trim()) return { result: null, error: null };
    try {
      return {
        result: parseSocialContentImport(importDraft),
        error: null,
      };
    } catch (importError) {
      return {
        result: null,
        error:
          importError instanceof Error
            ? importError.message
            : "Could not read this import.",
      };
    }
  }, [importDraft]);

  function openPost(post: ApprovalPost, reviewerKeys: string[]) {
    setSelectedId(post.id);
    setActiveModalPhase(workflowPhaseForPost(post, reviewerKeys));
    setCaptionDraft(post.post_caption);
    setSlideCaptionDrafts(
      Object.fromEntries(
        post.task_slides.map((slide) => [
          slide.id,
          slide.slide_caption ?? "",
        ]),
      ),
    );
    setSlideTextDrafts(
      Object.fromEntries(
        post.task_slides.map((slide) => [slide.id, slide.on_screen_text]),
      ),
    );
    setSlideVisualDrafts(
      Object.fromEntries(
        post.task_slides.map((slide) => [slide.id, slide.visual_note]),
      ),
    );
    setSlideImageDrafts(
      Object.fromEntries(
        post.task_slides.map((slide) => [slide.id, slide.image_url ?? ""]),
      ),
    );
    setContentDraft({
      title: post.title,
      format: post.format ?? "image",
      platform: post.platform ?? "Instagram",
      purpose: post.purpose ?? "",
      contentPillar: post.content_pillar ?? "",
      targetAudience: post.target_audience ?? "",
      cta: post.cta ?? "",
      dueDate: post.due_date ?? "",
      brief: post.brief,
      visualNote: post.visual_note ?? "",
      storyInteraction: post.story_interaction,
      productionStatus: post.production_status,
      reelDetails: post.reel_details,
      requiresFilming: post.requires_filming,
      filmingDetails: post.filming_details,
      creativeDriveLink: post.creative_drive_link ?? "",
      livePostUrl: post.live_post_url ?? "",
      schedulingMode: post.scheduling_mode,
      assigneeUsernames: post.assignee_usernames,
    });
    setScheduleDraft(toDateTimeInput(post.scheduled_at));
    setSlideReferenceDraft("");
    setCommentDraft("");
    setIsRequestingChanges(false);
    setSelectedSlide(0);
    setFeedback(null);
  }

  function showCollection(nextView: "active" | "archive") {
    setCollectionView(nextView);
    setCalendarFilter(nextView === "archive" ? "posted" : "all");
    setSelectedId(null);
    const firstDatedPost = posts.find(
      (post) =>
        Boolean(
          nextView === "archive" ? post.posted_at : post.scheduled_at,
        ) &&
        (nextView === "archive" ? Boolean(post.posted_at) : !post.posted_at),
    );
    const firstDate = firstDatedPost
      ? nextView === "archive"
        ? firstDatedPost.posted_at
        : firstDatedPost.scheduled_at
      : null;
    if (firstDate) {
      const date = new Date(firstDate);
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }

  function hasCompletedClientApproval(post: ApprovalPost) {
    return (
      approvalStatusForReviewerKeys(
        post.client_approvals,
        clientReviewerKeys,
      ) === "approved"
    );
  }

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calendarCells = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const collectionDate = (post: ApprovalPost) =>
    collectionView === "archive" ? post.posted_at : post.scheduled_at;

  const postsByDate = new Map<string, ApprovalPost[]>();
  visiblePosts.forEach((post) => {
    const key = toDateKey(collectionDate(post));
    if (!key) return;
    postsByDate.set(key, [...(postsByDate.get(key) ?? []), post]);
  });

  const unscheduledPosts = visiblePosts.filter(
    (post) => !post.scheduled_at,
  );
  const storyPosts = visiblePosts
    .filter((post) => post.format === "story" && collectionDate(post))
    .sort(
      (a, b) =>
        new Date(collectionDate(a)!).getTime() -
        new Date(collectionDate(b)!).getTime(),
    );
  const feedPosts = visiblePosts
    .filter((post) => post.format !== "story" && collectionDate(post))
    .sort(
      (a, b) =>
        new Date(collectionDate(b)!).getTime() -
        new Date(collectionDate(a)!).getTime(),
    );
  const readyUnsent = posts.filter(
    (post) =>
      !post.posted_at &&
      !post.sent_to_client_at &&
      isReadyForClient(post, requiredReviewers),
  );
  const readyUnsentForMonth = readyUnsent.filter((post) => {
    const date = new Date(post.scheduled_at!);
    return date.getFullYear() === year && date.getMonth() === month;
  });

  function updatePost(postId: string, patch: Partial<ApprovalPost>) {
    setPosts((current) =>
      current.map((post) => (post.id === postId ? { ...post, ...patch } : post)),
    );
  }

  function notifyTransition(
    post: ApprovalPost,
    action:
      | "internal_changes_requested"
      | "sent_to_client"
      | "publishing_date_changed"
      | "scheduled"
      | "manual_reminder_scheduled"
      | "posted",
    transitionValue: string,
    comment?: string,
  ) {
    const calendarId = post.division_task_id ?? workspaceId;
    if (!calendarId || !isWorkspaceClientSlug(resolvedClientSlug)) return;
    void sendSlackNotification({
      type: "social_transition",
      clientSlug: resolvedClientSlug,
      action,
      taskId: post.id,
      calendarId,
      transitionKey: `${post.id}:${action}:${transitionValue}`,
      title: post.title,
      assigneeNames: assigneeDisplayNames(post),
      scheduledAt: post.scheduled_at,
      comment,
    });
  }

  async function reschedulePost(post: ApprovalPost, dateKey: string) {
    if (
      mode !== "internal" ||
      post.posted_at ||
      post.publishing_status === "scheduled" ||
      isSaving
    ) {
      return;
    }
    const [targetYear, targetMonth, targetDay] = dateKey
      .split("-")
      .map(Number);
    const nextDate = post.scheduled_at
      ? new Date(post.scheduled_at)
      : new Date(new Date().setHours(12, 0, 0, 0));
    nextDate.setFullYear(targetYear, targetMonth - 1, targetDay);
    const iso = nextDate.toISOString();

    setIsSaving(true);
    setError(null);
    const { error: saveError } = await supabase
      .from("tasks")
      .update({
        scheduled_at: iso,
        ...(post.scheduling_mode === "manual"
          ? { manual_reminder_sent_at: null }
          : {}),
      })
      .eq("id", post.id);
    setIsSaving(false);

    if (saveError) {
      setError(`Could not move this post: ${saveError.message}`);
      return;
    }
    updatePost(post.id, {
      scheduled_at: iso,
      ...(post.scheduling_mode === "manual"
        ? { manual_reminder_sent_at: null }
        : {}),
    });
    if (
      deriveClientApprovalState(
        post.client_approvals,
        clientReviewerKeys,
        post.sent_to_client_at,
      ) === "approved" &&
      post.scheduled_at !== iso
    ) {
      notifyTransition(
        { ...post, scheduled_at: iso },
        "publishing_date_changed",
        iso,
      );
    }
    setFeedback(`${post.title} moved to ${formatDate(iso, true)}.`);
  }

  async function savePlanning(post: ApprovalPost): Promise<boolean> {
    if (
      mode !== "internal" ||
      !contentDraft ||
      post.posted_at ||
      isSaving
    ) {
      return false;
    }
    setIsSaving(true);
    setError(null);
    const creativeDriveLink = contentDraft.creativeDriveLink.trim();
    if (creativeDriveLink) {
      try {
        const hostname = new URL(creativeDriveLink).hostname.toLowerCase();
        if (
          hostname !== "drive.google.com" &&
          hostname !== "docs.google.com"
        ) {
          throw new Error("Not a Google Drive URL");
        }
      } catch {
        setIsSaving(false);
        setError("Enter a valid Google Drive link for the creative.");
        return false;
      }
    }
    const scheduledAt = scheduleDraft
      ? new Date(scheduleDraft).toISOString()
      : null;

    if (
      contentDraft.format === "carousel" ||
      contentDraft.format === "image" ||
      contentDraft.format === "story"
    ) {
      for (const slide of post.task_slides) {
        const nextCaption = (slideCaptionDrafts[slide.id] ?? "").trim();
        const nextText = (slideTextDrafts[slide.id] ?? "").trim();
        const nextVisual = (slideVisualDrafts[slide.id] ?? "").trim();
        const nextImage = (slideImageDrafts[slide.id] ?? "").trim();
        if (
          nextCaption === (slide.slide_caption ?? "") &&
          nextText === slide.on_screen_text &&
          nextVisual === slide.visual_note &&
          nextImage === (slide.image_url ?? "")
        ) {
          continue;
        }

        const { error: slideSaveError } = await supabase
          .from("task_slides")
          .update({
            slide_caption: nextCaption || null,
            on_screen_text: nextText,
            visual_note: nextVisual,
            image_url: nextImage || null,
          })
          .eq("id", slide.id);
        if (slideSaveError) {
          setIsSaving(false);
          setError(
            `Could not save the caption for slide ${slide.slide_number}: ${slideSaveError.message}`,
          );
          return false;
        }
      }
    }

    const assignedProfiles = Object.values(TEAM_IDENTITIES).filter((profile) =>
      contentDraft.assigneeUsernames.includes(profile.username),
    );
    const mentionSource = [
      contentDraft.title,
      contentDraft.purpose,
      contentDraft.brief,
      contentDraft.visualNote,
      captionDraft,
      contentDraft.reelDetails.hook,
      contentDraft.reelDetails.script,
      contentDraft.reelDetails.shotList,
      contentDraft.reelDetails.editingFlow,
      contentDraft.reelDetails.onScreenText,
      contentDraft.storyInteraction.prompt,
      ...contentDraft.storyInteraction.options,
      contentDraft.filmingDetails.script,
      contentDraft.filmingDetails.shotList,
      ...Object.values(slideTextDrafts),
      ...Object.values(slideVisualDrafts),
    ]
      .join("\n")
      .toLocaleLowerCase();
    const mentionedUsernames = Object.values(TEAM_IDENTITIES)
      .filter(
        (profile) =>
          mentionSource.includes(`@${profile.name.toLocaleLowerCase()}`) ||
          mentionSource.includes(`@${profile.username.toLocaleLowerCase()}`),
      )
      .map((profile) => profile.username);
    const nextMentionedUsernames = Array.from(
      new Set([...post.mentioned_usernames, ...mentionedUsernames]),
    );
    const nextWatcherUsernames = Array.from(
      new Set([...post.watcher_usernames, ...mentionedUsernames]),
    );
    const clientState = deriveClientApprovalState(
      post.client_approvals,
      clientReviewerKeys,
      post.sent_to_client_at,
    );
    const livePostUrl = contentDraft.livePostUrl.trim();
    const shouldMarkPosted = Boolean(livePostUrl);
    const postedAt = shouldMarkPosted
      ? (post.posted_at ?? new Date().toISOString())
      : post.posted_at;
    const postedBy = shouldMarkPosted
      ? (post.posted_by ??
        currentReviewer?.name ??
        readTeamSessionProfile()?.name ??
        "the team")
      : post.posted_by;
    const publishingStatus: SocialPublishingStatus = shouldMarkPosted
      ? "posted"
      : post.publishing_status;
    const productionStatus = shouldMarkPosted
      ? "complete"
      : reconcileSocialProductionStatus(
          contentDraft.productionStatus,
          post.sent_to_client_at,
          post.client_approvals,
        );
    const manualReminderSentAt =
      contentDraft.schedulingMode === "manual" &&
      post.scheduling_mode === "manual" &&
      post.scheduled_at === scheduledAt
        ? post.manual_reminder_sent_at
        : null;
    const postCaption =
      contentDraft.format === "carousel" ? "" : captionDraft.trim();
    const legacyStatus = legacyStatusForSocialDimensions(
      productionStatus,
      publishingStatus,
      clientState,
    );
    const { error: saveError } = await supabase
      .from("tasks")
      .update({
        title: contentDraft.title.trim() || "Untitled content",
        format: contentDraft.format,
        platform: contentDraft.platform.trim() || null,
        purpose: contentDraft.purpose.trim() || null,
        content_pillar: contentDraft.contentPillar.trim() || null,
        target_audience: contentDraft.targetAudience.trim() || null,
        cta: contentDraft.cta.trim() || null,
        due_date: contentDraft.dueDate || null,
        brief: contentDraft.brief.trim(),
        visual_note: contentDraft.visualNote.trim() || null,
        story_interaction:
          contentDraft.format === "story"
            ? contentDraft.storyInteraction
            : { type: "none", prompt: "", options: [] },
        production_status: productionStatus,
        publishing_status: publishingStatus,
        status: legacyStatus,
        reel_details:
          contentDraft.format === "reel" ? contentDraft.reelDetails : null,
        requires_filming: contentDraft.requiresFilming,
        filming_details: contentDraft.filmingDetails,
        creative_drive_link: creativeDriveLink || null,
        live_post_url: livePostUrl || null,
        posted_at: postedAt,
        posted_by: postedBy,
        scheduling_mode: contentDraft.schedulingMode,
        manual_reminder_sent_at: manualReminderSentAt,
        assignee_usernames: contentDraft.assigneeUsernames,
        assigned_to: assignedProfiles[0]?.name ?? null,
        assignee: assignedProfiles[0]?.name ?? "Unassigned",
        mentioned_usernames: nextMentionedUsernames,
        watcher_usernames: nextWatcherUsernames,
        post_caption: postCaption,
        scheduled_at: scheduledAt,
      })
      .eq("id", post.id);
    setIsSaving(false);

    if (saveError) {
      setError(`Could not save the final details: ${saveError.message}`);
      return false;
    }
    updatePost(post.id, {
      title: contentDraft.title.trim() || "Untitled content",
      format: contentDraft.format,
      platform: contentDraft.platform.trim() || null,
      purpose: contentDraft.purpose.trim() || null,
      content_pillar: contentDraft.contentPillar.trim() || null,
      target_audience: contentDraft.targetAudience.trim() || null,
      cta: contentDraft.cta.trim() || null,
      due_date: contentDraft.dueDate || null,
      brief: contentDraft.brief.trim(),
      visual_note: contentDraft.visualNote.trim() || null,
      story_interaction:
        contentDraft.format === "story"
          ? contentDraft.storyInteraction
          : { type: "none", prompt: "", options: [] },
      production_status: productionStatus,
      publishing_status: publishingStatus,
      status: legacyStatus,
      reel_details: contentDraft.reelDetails,
      requires_filming: contentDraft.requiresFilming,
      filming_details: contentDraft.filmingDetails,
      creative_drive_link: creativeDriveLink || null,
      live_post_url: livePostUrl || null,
      posted_at: postedAt,
      posted_by: postedBy,
      scheduling_mode: contentDraft.schedulingMode,
      manual_reminder_sent_at: manualReminderSentAt,
      assignee_usernames: contentDraft.assigneeUsernames,
      assigned_to: assignedProfiles[0]?.name ?? null,
      mentioned_usernames: nextMentionedUsernames,
      watcher_usernames: nextWatcherUsernames,
      post_caption: postCaption,
      scheduled_at: scheduledAt,
      task_slides: post.task_slides.map((slide) => ({
        ...slide,
        on_screen_text: (slideTextDrafts[slide.id] ?? "").trim(),
        visual_note: (slideVisualDrafts[slide.id] ?? "").trim(),
        image_url: (slideImageDrafts[slide.id] ?? "").trim() || null,
        slide_caption:
          contentDraft.format === "carousel" ||
          contentDraft.format === "image" ||
          contentDraft.format === "story"
            ? (slideCaptionDrafts[slide.id] ?? "").trim() || null
            : slide.slide_caption,
      })),
    });
    if (scheduledAt) {
      const date = new Date(scheduledAt);
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    if (
      !shouldMarkPosted &&
      post.scheduled_at !== scheduledAt &&
      deriveClientApprovalState(
        post.client_approvals,
        clientReviewerKeys,
        post.sent_to_client_at,
      ) === "approved"
    ) {
      notifyTransition(
        { ...post, scheduled_at: scheduledAt },
        "publishing_date_changed",
        scheduledAt ?? "unscheduled",
      );
    }
    if (shouldMarkPosted && !post.posted_at && postedAt) {
      notifyTransition(
        { ...post, live_post_url: livePostUrl },
        "posted",
        postedAt,
      );
    }
    setFeedback(
      shouldMarkPosted
        ? `${post.title} saved as posted and moved to the Archive.`
        : post.format === "carousel"
          ? "Planning, creative direction, publishing details, and slides saved."
          : "Planning, production, filming, and publishing details saved.",
    );
    return true;
  }

  async function saveAndSubmitForInternalReview(post: ApprovalPost) {
    if (!contentDraft?.creativeDriveLink.trim()) {
      setError(
        "Add the creative Google Drive link before submitting for review.",
      );
      return;
    }

    const saved = await savePlanning(post);
    if (!saved) return;

    await submitForInternalReview({
      ...post,
      title: contentDraft.title.trim() || "Untitled content",
      creative_drive_link: contentDraft.creativeDriveLink.trim(),
      assignee_usernames: contentDraft.assigneeUsernames,
    });
  }

  async function toggleFinalConfirmation(post: ApprovalPost) {
    if (
      mode !== "internal" ||
      post.posted_at ||
      post.publishing_status === "scheduled" ||
      !currentReviewer ||
      isSaving
    ) {
      return;
    }
    const nextConfirmed = !post.final_confirmed;
    const timestamp = new Date().toISOString();
    setIsSaving(true);
    const { error: saveError } = await supabase
      .from("tasks")
      .update({
        final_confirmed: nextConfirmed,
        final_confirmed_by: nextConfirmed ? currentReviewer.name : null,
        final_confirmed_at: nextConfirmed ? timestamp : null,
      })
      .eq("id", post.id);
    setIsSaving(false);
    if (saveError) {
      setError(`Could not update final confirmation: ${saveError.message}`);
      return;
    }
    updatePost(post.id, {
      final_confirmed: nextConfirmed,
      final_confirmed_by: nextConfirmed ? currentReviewer.name : null,
      final_confirmed_at: nextConfirmed ? timestamp : null,
    });
    setFeedback(
      nextConfirmed
        ? `Final content confirmed by ${currentReviewer.name}.`
        : "Final confirmation removed.",
    );
  }

  async function addSlideReference(post: ApprovalPost, slide: Slide) {
    const url = slideReferenceDraft.trim();
    if (!url || isSaving) return;
    try {
      new URL(url);
    } catch {
      setError("Enter a valid reference URL.");
      return;
    }
    const hostname = new URL(url).hostname.toLowerCase();
    const platform = hostname.includes("pinterest") || hostname.includes("pin.it")
      ? "pinterest"
      : hostname.includes("instagram.com")
        ? "instagram"
        : "other";
    setIsSaving(true);
    const { data, error: referenceError } = await supabase
      .from("slide_references")
      .insert({
        task_slide_id: slide.id,
        url,
        platform,
        created_by: readTeamSessionProfile()?.username ?? null,
      })
      .select("id, url, platform")
      .single();
    setIsSaving(false);
    if (referenceError || !data) {
      setError(
        `Could not add the reference: ${referenceError?.message ?? "No reference returned."}`,
      );
      return;
    }
    updatePost(post.id, {
      task_slides: post.task_slides.map((item) =>
        item.id === slide.id
          ? {
              ...item,
              slide_references: [...item.slide_references, data],
            }
          : item,
      ),
    });
    setSlideReferenceDraft("");
    setFeedback("Reference added.");
  }

  async function addSlide(post: ApprovalPost) {
    if (isSaving || post.format === "reel") return;
    const slideNumber =
      Math.max(0, ...post.task_slides.map((slide) => slide.slide_number)) + 1;
    setIsSaving(true);
    const { data, error: slideError } = await supabase
      .from("task_slides")
      .insert({
        task_id: post.id,
        slide_number: slideNumber,
        on_screen_text: "",
        visual_note: "",
      })
      .select(
        "id, slide_number, on_screen_text, visual_note, slide_caption, warning_flag, image_url",
      )
      .single();
    setIsSaving(false);
    if (slideError || !data) {
      setError(`Could not add a slide: ${slideError?.message ?? "No slide returned."}`);
      return;
    }
    const slide: Slide = { ...data, slide_references: [] };
    updatePost(post.id, { task_slides: [...post.task_slides, slide] });
    setSlideTextDrafts((current) => ({ ...current, [slide.id]: "" }));
    setSlideVisualDrafts((current) => ({ ...current, [slide.id]: "" }));
    setSlideCaptionDrafts((current) => ({ ...current, [slide.id]: "" }));
    setSlideImageDrafts((current) => ({ ...current, [slide.id]: "" }));
    setSelectedSlide(post.task_slides.length);
  }

  async function moveSlide(post: ApprovalPost, direction: -1 | 1) {
    const targetIndex = selectedSlide + direction;
    if (
      isSaving ||
      targetIndex < 0 ||
      targetIndex >= post.task_slides.length
    ) {
      return;
    }
    const ordered = [...post.task_slides];
    [ordered[selectedSlide], ordered[targetIndex]] = [
      ordered[targetIndex],
      ordered[selectedSlide],
    ];
    setIsSaving(true);
    for (const [index, slide] of ordered.entries()) {
      const { error: temporaryError } = await supabase
        .from("task_slides")
        .update({ slide_number: 1000 + index })
        .eq("id", slide.id);
      if (temporaryError) {
        setIsSaving(false);
        setError(`Could not reorder slides: ${temporaryError.message}`);
        return;
      }
    }
    for (const [index, slide] of ordered.entries()) {
      const { error: orderError } = await supabase
        .from("task_slides")
        .update({ slide_number: index + 1 })
        .eq("id", slide.id);
      if (orderError) {
        setIsSaving(false);
        setError(`Could not finish reordering slides: ${orderError.message}`);
        return;
      }
    }
    setIsSaving(false);
    updatePost(post.id, {
      task_slides: ordered.map((slide, index) => ({
        ...slide,
        slide_number: index + 1,
      })),
    });
    setSelectedSlide(targetIndex);
  }

  async function submitForInternalReview(post: ApprovalPost) {
    if (
      mode !== "internal" ||
      post.publishing_status === "posted" ||
      post.publishing_status === "scheduled" ||
      isSaving
    ) {
      return;
    }
    const timestamp = new Date().toISOString();
    const productionStatus = productionStatusAfterTransition(
      post.production_status,
      post.production_status === "changes_required"
        ? "resubmit_after_changes"
        : "submit_internal_review",
    );
    setIsSaving(true);
    setError(null);
    const { error: submitError } = await supabase
      .from("tasks")
      .update({
        production_status: productionStatus,
        status: "for_review",
        internal_review_submitted_at: timestamp,
        internal_approvals: {},
        final_confirmed: false,
        final_confirmed_by: null,
        final_confirmed_at: null,
      })
      .eq("id", post.id);
    setIsSaving(false);
    if (submitError) {
      setError(`Could not submit for internal review: ${submitError.message}`);
      return;
    }
    updatePost(post.id, {
      production_status: productionStatus,
      status: "for_review",
      internal_review_submitted_at: timestamp,
      internal_approvals: {},
      final_confirmed: false,
      final_confirmed_by: null,
      final_confirmed_at: null,
    });
    if (isWorkspaceClientSlug(resolvedClientSlug)) {
      void sendSlackNotification({
        type: "task_review",
        clientSlug: resolvedClientSlug,
        title: post.title,
        taskId: post.id,
        calendarId: post.division_task_id ?? workspaceId,
        assigneeNames: assigneeDisplayNames(post),
        scheduledAt: post.scheduled_at,
        transitionKey: `${post.id}:internal_review_submitted:${timestamp}`,
      });
    }
    setActiveModalPhase("approval");
    setFeedback(`${post.title} was submitted for internal review.`);
  }

  async function recordDecision(
    post: ApprovalPost,
    status: Exclude<ReviewStatus, "pending">,
  ) {
    if (
      !currentReviewer ||
      post.posted_at ||
      post.publishing_status === "scheduled" ||
      isSaving
    ) {
      return;
    }
    const note = status === "changes" ? commentDraft.trim() : "";
    if (status === "changes" && !note) return;

    const timestamp = new Date().toISOString();
    const reviewColumn =
      mode === "internal" ? "internal_approvals" : "client_approvals";
    const currentReviews =
      mode === "internal" ? post.internal_approvals : post.client_approvals;
    const nextReviews = {
      ...currentReviews,
      [currentReviewer.key]: {
        status,
        reviewed_at: timestamp,
        reviewer_name: currentReviewer.name,
        ...(note ? { comment: note } : {}),
      },
    };
    const historyEntry: ApprovalHistoryEntry = {
      stage: mode,
      reviewer_key: currentReviewer.key,
      reviewer_name: currentReviewer.name,
      status,
      at: timestamp,
      ...(note ? { note } : {}),
    };
    const nextHistory = [...post.approval_history, historyEntry];
    const nextApprovalStatus = approvalStatusForReviewerKeys(
      nextReviews,
      requiredReviewers.map((reviewer) => reviewer.key),
    );
    const approvalComplete = nextApprovalStatus === "approved";
    const nextProductionStatus =
      nextApprovalStatus === "changes"
        ? productionStatusAfterTransition(
            post.production_status,
            mode === "client"
              ? "request_client_changes"
              : "request_internal_changes",
          )
        : approvalComplete
          ? productionStatusAfterTransition(
              post.production_status,
              "complete_internal_review",
            )
          : "ready_for_review";
    const nextWorkflowStatus = legacyStatusForSocialDimensions(
      nextProductionStatus,
      post.publishing_status,
      mode === "client" && approvalComplete ? "approved" : undefined,
    );

    setIsSaving(true);
    const { error: saveError } = await supabase
      .from("tasks")
      .update({
        [reviewColumn]: nextReviews,
        approval_history: nextHistory,
        status: nextWorkflowStatus,
        production_status: nextProductionStatus,
      })
      .eq("id", post.id);
    setIsSaving(false);

    if (saveError) {
      setError(`Could not save the review: ${saveError.message}`);
      return;
    }

    updatePost(post.id, {
      [reviewColumn]: nextReviews,
      approval_history: nextHistory,
      status: nextWorkflowStatus,
      production_status: nextProductionStatus,
    });
    if (mode === "client" && clientSlug) {
      void sendSlackNotification({
        type: "client_review",
        clientSlug,
        action: status === "approved" ? "approved" : "requested_changes",
        title: post.title,
        reviewerName: currentReviewer.name,
        comment: note || undefined,
        assigneeNames: assigneeDisplayNames(post),
        taskId: post.id,
        calendarId: post.division_task_id,
        scheduledAt: post.scheduled_at,
        transitionKey: `${post.id}:client_${status}:${timestamp}:${currentReviewer.key}`,
      });
    } else if (mode === "internal" && status === "changes") {
      notifyTransition(
        post,
        "internal_changes_requested",
        `${timestamp}:${currentReviewer.key}`,
        note,
      );
    }
    setCommentDraft("");
    setIsRequestingChanges(false);
    setFeedback(
      status === "approved"
        ? `${currentReviewer.name} approved this post.`
        : `${currentReviewer.name} requested changes.`,
    );
  }

  async function sendPostsToClient(targets: ApprovalPost[]) {
    if (
      mode !== "internal" ||
      !canSendToClient ||
      !currentReviewer ||
      targets.length === 0 ||
      isSending
    ) {
      return;
    }

    const eligible = targets.filter(
      (post) =>
        !post.sent_to_client_at &&
        isReadyForClient(post, requiredReviewers),
    );
    if (!eligible.length) return;

    const timestamp = new Date().toISOString();
    setIsSending(true);
    setError(null);
    const { error: sendError } = await supabase
      .from("tasks")
      .update({
        sent_to_client_at: timestamp,
        sent_to_client_by: currentReviewer.name,
        status: "for_review",
        production_status: "complete",
        client_approvals: {},
      })
      .in(
        "id",
        eligible.map((post) => post.id),
      );

    if (!sendError && resolvedClientId) {
      await supabase.from("client_approval_categories").upsert(
        {
          client_id: resolvedClientId,
          name: "Social media",
          status: "approval_needed",
          description: `${eligible.length} ${
            eligible.length === 1 ? "post" : "posts"
          } ready for review`,
          route_slug: "social-media",
        },
        { onConflict: "client_id,route_slug" },
      );
    }
    setIsSending(false);

    if (sendError) {
      setError(`Could not send posts to the client portal: ${sendError.message}`);
      return;
    }
    const targetIds = new Set(eligible.map((post) => post.id));
    setPosts((current) =>
      current.map((post) =>
        targetIds.has(post.id)
          ? {
              ...post,
              sent_to_client_at: timestamp,
              sent_to_client_by: currentReviewer.name,
              client_approvals: {},
              status: "for_review",
              production_status: "complete",
            }
          : post,
      ),
    );
    eligible.forEach((post) =>
      notifyTransition(post, "sent_to_client", timestamp),
    );
    setFeedback(
      `${eligible.length} ${
        eligible.length === 1 ? "post was" : "posts were"
      } sent to the client portal.`,
    );
  }

  async function resendPostToClient(post: ApprovalPost) {
    if (
      mode !== "internal" ||
      !canSendToClient ||
      !currentReviewer ||
      !resolvedClientId ||
      !post.sent_to_client_at ||
      post.posted_at ||
      !hasClientChangesRequested(post) ||
      post.production_status !== "complete" ||
      deriveInternalApprovalState(
        post.internal_approvals,
        INTERNAL_REVIEWER_KEYS,
        post.internal_review_submitted_at,
      ) !== "approved" ||
      isSending
    ) {
      return;
    }

    const timestamp = new Date().toISOString();
    setIsSending(true);
    setError(null);
    const { error: resendError } = await supabase
      .from("tasks")
      .update({
        sent_to_client_at: timestamp,
        sent_to_client_by: currentReviewer.name,
        status: "for_review",
        production_status: "complete",
        client_approvals: {},
      })
      .eq("id", post.id)
      .eq("client_id", resolvedClientId);

    if (!resendError) {
      await supabase.from("client_approval_categories").upsert(
        {
          client_id: resolvedClientId,
          name: "Social media",
          status: "approval_needed",
          description: "Updated post ready for review",
          route_slug: "social-media",
        },
        { onConflict: "client_id,route_slug" },
      );
    }
    setIsSending(false);

    if (resendError) {
      setError(`Could not resend this post: ${resendError.message}`);
      return;
    }

    updatePost(post.id, {
      sent_to_client_at: timestamp,
      sent_to_client_by: currentReviewer.name,
      client_approvals: {},
      status: "for_review",
      production_status: "complete",
    });
    notifyTransition(post, "sent_to_client", timestamp);
    setFeedback(`${post.title} was resent to the client for a new review.`);
  }

  async function setScheduledState(post: ApprovalPost, isScheduled: boolean) {
    const schedulingMode = isScheduled
      ? (contentDraft?.schedulingMode ?? post.scheduling_mode)
      : post.scheduling_mode;
    const scheduledAt = isScheduled
      ? scheduleDraft
        ? new Date(scheduleDraft).toISOString()
        : post.scheduled_at
      : post.scheduled_at;
    if (
      mode !== "internal" ||
      !canSendToClient ||
      !currentReviewer ||
      post.posted_at ||
      isSaving ||
      (isScheduled &&
        !canScheduleSocialPost({
          scheduledAt,
          sentToClientAt: post.sent_to_client_at,
          clientApprovalState: deriveClientApprovalState(
            post.client_approvals,
            clientReviewerKeys,
            post.sent_to_client_at,
          ),
        })) ||
      (!isScheduled && post.publishing_status !== "scheduled")
    ) {
      return;
    }

    const publishingStatus = isScheduled ? "scheduled" : "unscheduled";
    const status: SocialPostStatus = legacyStatusForSocialDimensions(
      post.production_status,
      publishingStatus,
      "approved",
    );
    const transitionTimestamp = new Date().toISOString();
    setIsSaving(true);
    setError(null);
    const { error: saveError } = await supabase
      .from("tasks")
      .update({
        status,
        publishing_status: publishingStatus,
        scheduling_mode: schedulingMode,
        scheduled_at: scheduledAt,
        manual_reminder_sent_at: null,
      })
      .eq("id", post.id);
    setIsSaving(false);

    if (saveError) {
      setError(
        `Could not ${isScheduled ? "mark this post as scheduled" : "move this post back to client approved"}: ${saveError.message}`,
      );
      return;
    }

    updatePost(post.id, {
      status,
      publishing_status: publishingStatus,
      scheduling_mode: schedulingMode,
      scheduled_at: scheduledAt,
      manual_reminder_sent_at: null,
    });
    if (isScheduled) {
      notifyTransition(
        { ...post, scheduling_mode: schedulingMode, scheduled_at: scheduledAt },
        schedulingMode === "manual" ? "manual_reminder_scheduled" : "scheduled",
        transitionTimestamp,
      );
    }
    setFeedback(
      isScheduled
        ? schedulingMode === "manual"
          ? `${post.title} will be sent to Slack with its creative when it is time to post.`
          : `${post.title} is queued in Meta and ready to auto-publish.`
        : `${post.title} moved back to client approved. Its scheduling details can now be changed.`,
    );
  }

  async function setPostedState(post: ApprovalPost, isPosted: boolean) {
    const livePostUrl = contentDraft?.livePostUrl.trim() || post.live_post_url;
    if (
      mode !== "internal" ||
      !canSendToClient ||
      !currentReviewer ||
      (isPosted &&
        post.publishing_status !== "scheduled" &&
        !livePostUrl) ||
      (!isPosted && !post.posted_at) ||
      isSaving
    ) {
      return;
    }

    const postedAt = isPosted ? new Date().toISOString() : null;
    const postedBy = isPosted ? currentReviewer.name : null;
    const publishingStatus = publishingStatusAfterTransition(
      post.publishing_status,
      isPosted ? "mark_posted" : "restore_posted",
    );
    setIsSaving(true);
    setError(null);
    const { error: saveError } = await supabase
      .from("tasks")
      .update({
        posted_at: postedAt,
        posted_by: postedBy,
        status: isPosted ? "posted" : "scheduled",
        publishing_status: publishingStatus,
        ...(isPosted ? { live_post_url: livePostUrl || null } : {}),
      })
      .eq("id", post.id);
    setIsSaving(false);

    if (saveError) {
      setError(
        `Could not ${isPosted ? "archive" : "restore"} this post: ${saveError.message}`,
      );
      return;
    }

    updatePost(post.id, {
      posted_at: postedAt,
      posted_by: postedBy,
      status: isPosted ? "posted" : "scheduled",
      publishing_status: publishingStatus,
      ...(isPosted ? { live_post_url: livePostUrl || null } : {}),
    });
    if (isPosted && postedAt) {
      notifyTransition(post, "posted", postedAt);
    }
    setFeedback(
      isPosted
        ? `${post.title} marked as posted and archived.`
        : `${post.title} restored to the active approval workflow.`,
    );
  }

  async function addPost() {
    if (
      mode !== "internal" ||
      !resolvedClientId ||
      !workspaceId ||
      isSaving
    ) {
      return;
    }
    const teamProfile = readTeamSessionProfile();
    setIsSaving(true);
    setError(null);
    const { data, error: createError } = await supabase
      .from("tasks")
      .insert({
        client_id: resolvedClientId,
        division_task_id: workspaceId,
        title: "Untitled content",
        brief: "",
        format: "image",
        post_caption: "",
        status: "not_started",
        production_status: "not_started",
        publishing_status: "unscheduled",
        scheduling_mode: "automatic",
        manual_reminder_sent_at: null,
        assignee_usernames: teamProfile?.username
          ? [teamProfile.username]
          : [],
        assigned_to: teamProfile?.name ?? null,
        assignee: teamProfile?.name ?? "Unassigned",
      })
      .select("id")
      .single();
    setIsSaving(false);
    if (createError || !data) {
      setError(
        `Could not add content: ${createError?.message ?? "No post returned."}`,
      );
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("post", data.id);
    window.location.assign(url.toString());
  }

  async function importPosts() {
    if (
      mode !== "internal" ||
      !resolvedClientId ||
      !workspaceId ||
      !importPreview.result ||
      isImporting
    ) {
      return;
    }

    const teamProfile = readTeamSessionProfile();
    const importedPosts = importPreview.result.posts.map((post) => ({
      ...post,
      id: crypto.randomUUID(),
    }));
    const taskIds = importedPosts.map((post) => post.id);
    setIsImporting(true);
    setError(null);

    const { error: taskError } = await supabase.from("tasks").insert(
      importedPosts.map((post) => ({
        id: post.id,
        client_id: resolvedClientId,
        division_task_id: workspaceId,
        title: post.title,
        brief: post.brief,
        format: post.format,
        platform: post.platform || null,
        purpose: post.purpose || null,
        content_pillar: post.contentPillar || null,
        target_audience: post.targetAudience || null,
        cta: post.cta || null,
        due_date: post.dueDate || null,
        scheduled_at: post.scheduledAt || null,
        visual_note: post.visualDirection || null,
        story_interaction: post.storyInteraction,
        post_caption: post.caption,
        reel_details: post.format === "reel" ? post.reelDetails : null,
        requires_filming: post.requiresFilming,
        filming_details: post.filmingDetails,
        status: "not_started",
        production_status: "not_started",
        publishing_status: "unscheduled",
        scheduling_mode: post.schedulingMode,
        manual_reminder_sent_at: null,
        assignee_usernames: teamProfile?.username
          ? [teamProfile.username]
          : [],
        assigned_to: teamProfile?.name ?? null,
        assignee: teamProfile?.name ?? "Unassigned",
      })),
    );

    if (taskError) {
      setIsImporting(false);
      setError(`Could not import the content cards: ${taskError.message}`);
      return;
    }

    const slideRows = importedPosts.flatMap((post) =>
      post.slides.map((slide, index) => ({
        task_id: post.id,
        slide_number: index + 1,
        on_screen_text: slide.onScreenText,
        visual_note: slide.visualDirection,
        slide_caption: slide.caption || null,
        image_url: slide.imageUrl || null,
      })),
    );
    const { error: slideError } = slideRows.length
      ? await supabase.from("task_slides").insert(slideRows)
      : { error: null };

    if (slideError) {
      await supabase.from("tasks").delete().in("id", taskIds);
      setIsImporting(false);
      setError(
        `The cards could not be completed, so the import was rolled back: ${slideError.message}`,
      );
      return;
    }

    const firstScheduledPost = importedPosts.find((post) => post.scheduledAt);
    if (firstScheduledPost) {
      const date = new Date(firstScheduledPost.scheduledAt);
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    setIsImporting(false);
    setIsImportOpen(false);
    setImportDraft("");
    setCollectionView("active");
    setCalendarFilter("all");
    setFeedback(
      `${importedPosts.length} ${
        importedPosts.length === 1 ? "content card was" : "content cards were"
      } imported with their production details.`,
    );
    setSyncRevision((current) => current + 1);
  }

  async function deletePost() {
    if (
      mode !== "internal" ||
      !workspaceId ||
      !postToDelete ||
      isDeleting
    ) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    const { data, error: deleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("id", postToDelete.id)
      .eq("client_id", postToDelete.client_id)
      .eq("division_task_id", workspaceId)
      .select("id");
    setIsDeleting(false);

    if (deleteError || data?.length !== 1) {
      setError(
        `Could not delete this card: ${
          deleteError?.message ?? "The card was not found or you do not have permission."
        }`,
      );
      return;
    }

    const deletedTitle = postToDelete.title;
    const deletedId = postToDelete.id;
    setPosts((current) => current.filter((post) => post.id !== deletedId));
    setSelectedId(null);
    setPostToDelete(null);
    setFeedback(`${deletedTitle} deleted.`);

    const url = new URL(window.location.href);
    if (url.searchParams.get("post") === deletedId) {
      url.searchParams.delete("post");
      window.history.replaceState({}, "", url);
    }
  }

  const monthLabel = new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
  }).format(visibleMonth);

  return (
    <main className="min-h-screen px-5 py-10 text-[var(--foreground)] sm:px-8 sm:py-14 lg:px-10">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-col gap-6 border-b border-[var(--border)] pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
              {mode === "internal"
                ? "Social media · Content planning"
                : "Projects · Social media"}
            </p>
            <h1
              className={`${fraunces.className} text-4xl font-medium leading-tight tracking-tight sm:text-5xl`}
            >
              {mode === "internal"
                ? "Social Content Calendar"
                : "Social media calendar"}
            </h1>
            <p
              className={`${fraunces.className} mt-2 italic text-lg text-[var(--foreground)]/55`}
            >
              {resolvedClientName}
            </p>
          </div>
          {mode === "internal" && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isSaving || isLoading}
                onClick={() => setIsImportOpen(true)}
                className="w-fit rounded-full border border-[var(--border)] bg-[var(--card)] px-5 py-3 text-sm font-semibold shadow-sm disabled:opacity-50"
              >
                Import content
              </button>
              <button
                type="button"
                disabled={isSaving || isLoading}
                onClick={() => void addPost()}
                className="w-fit rounded-full bg-[var(--foreground)] px-5 py-3 text-sm font-semibold text-[var(--background)] shadow-sm disabled:opacity-50"
              >
                + Add content
              </button>
            </div>
          )}
        </header>

        <nav
          aria-label="Social post collection"
          className="mt-6 inline-flex rounded-full border border-[var(--border)] bg-[var(--muted)] p-1"
        >
          {[
            { key: "active" as const, label: "Active", count: posts.length - archiveCount },
            { key: "archive" as const, label: "Archive", count: archiveCount },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={collectionView === item.key}
              onClick={() => showCollection(item.key)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                collectionView === item.key
                  ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--foreground)]/55 hover:text-[var(--foreground)]"
              }`}
            >
              {item.label} ({item.count})
            </button>
          ))}
        </nav>

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-2xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
          >
            {error}
          </p>
        )}
        {feedback && (
          <p
            role="status"
            className="mt-6 rounded-2xl border border-[#BFD8C7] bg-[#EAF5ED] px-4 py-3 text-sm text-[#356346]"
          >
            {feedback}
          </p>
        )}

        {mode === "internal" && (
          <nav
            aria-label="Calendar filters"
            className="mt-5 flex flex-wrap gap-2"
          >
            {[
              ["all", "All"],
              ["needs_work", "Needs work"],
              ["internal_review", "Internal review"],
              ["client_review", "Client review"],
              ["scheduled", "Scheduled"],
              ["posted", "Posted"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={calendarFilter === key}
                onClick={() => {
                  const nextFilter = key as typeof calendarFilter;
                  if (nextFilter === "posted") {
                    showCollection("archive");
                  } else {
                    if (collectionView === "archive") showCollection("active");
                    setCalendarFilter(nextFilter);
                  }
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  calendarFilter === key
                    ? "border-[var(--primary)] bg-[var(--muted)] text-[var(--primary)]"
                    : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]/60"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        )}

        <div className="mt-10 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:items-start">
          <section
            aria-labelledby="approval-grid-heading"
            className="xl:sticky xl:top-6 xl:order-2"
          >
            {storyPosts.length > 0 && (
              <section aria-labelledby="story-strip-heading" className="mb-8">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <h2
                      id="story-strip-heading"
                      className={`${fraunces.className} text-2xl font-medium`}
                    >
                      Stories
                    </h2>
                    <p className="mt-1 text-xs text-[var(--foreground)]/50">
                      Separate from the feed grid.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="mr-1 text-[10px] font-semibold text-[var(--foreground)]/40">
                      {storyPosts.length}
                    </span>
                    <button
                      type="button"
                      aria-label="View previous Stories"
                      onClick={() =>
                        storyStripRef.current?.scrollBy({
                          left: -300,
                          behavior: "smooth",
                        })
                      }
                      className="flex size-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)]"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      aria-label="View more Stories"
                      onClick={() =>
                        storyStripRef.current?.scrollBy({
                          left: 300,
                          behavior: "smooth",
                        })
                      }
                      className="flex size-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)]"
                    >
                      →
                    </button>
                  </div>
                </div>
                <div
                  ref={storyStripRef}
                  className="flex snap-x snap-mandatory gap-3 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 scroll-smooth"
                >
                  {storyPosts.map((post) => {
                    const previewUrl = postVisualPreviewUrl(post);
                    return (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => openPost(post, clientReviewerKeys)}
                        className="group w-28 shrink-0 snap-start text-left sm:w-32"
                      >
                        <div
                          className="relative aspect-[9/14] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--muted)] bg-cover bg-center shadow-sm transition group-hover:border-[var(--primary)]"
                          style={
                            previewUrl
                              ? {
                                  backgroundImage: `url("${previewUrl.replaceAll('"', "%22")}")`,
                                }
                              : undefined
                          }
                        >
                          {!previewUrl && (
                            <div className="flex h-full items-center justify-center p-3 text-center">
                              <p
                                className={`${fraunces.className} text-sm font-medium`}
                              >
                                {post.task_slides[0]?.on_screen_text ||
                                  post.title}
                              </p>
                            </div>
                          )}
                          {post.story_interaction.type !== "none" && (
                            <span className="absolute bottom-2 left-2 right-2 truncate rounded-full bg-[var(--card)]/90 px-2 py-1 text-center text-[8px] font-semibold shadow-sm backdrop-blur">
                              {
                                STORY_INTERACTION_TYPE_LABELS[
                                  post.story_interaction.type
                                ]
                              }
                            </span>
                          )}
                          {post.posted_at && (
                            <PostedStamp className="absolute right-2 top-2" />
                          )}
                        </div>
                        <span className="mt-2 block truncate text-xs font-semibold">
                          {post.title}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-[var(--foreground)]/45">
                          {formatDate(collectionDate(post), true)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            <div className="mb-4">
              <h2
                id="approval-grid-heading"
                className={`${fraunces.className} text-2xl font-medium`}
              >
                Feed preview
              </h2>
              <p className="mt-1 text-xs text-[var(--foreground)]/50">
                {collectionView === "archive"
                  ? "Published feed posts with the newest publication time first."
                  : "Planned feed posts with the newest publish date first. Stories appear above."}
              </p>
            </div>
            {feedPosts.length === 0 ? (
              <p className="rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center text-sm text-[var(--foreground)]/45">
                {collectionView === "archive"
                  ? "No published feed posts are in the Archive yet."
                  : "Schedule an Image, Carousel, or Reel to see it here in feed order."}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)] sm:gap-px">
                {feedPosts.map((post) => {
                  const previewUrl = postVisualPreviewUrl(post);
                  return (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => openPost(post, clientReviewerKeys)}
                      aria-label={`${post.title} — ${formatDate(collectionDate(post), true)}`}
                      className="group relative aspect-square bg-[var(--muted)] bg-cover bg-center transition hover:opacity-90"
                      style={
                        previewUrl
                          ? {
                              backgroundImage: `url("${previewUrl.replaceAll('"', "%22")}")`,
                            }
                          : undefined
                      }
                    >
                      {!previewUrl && (
                        <div className="flex h-full items-center justify-center">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            className="size-6 text-[var(--foreground)]/20"
                          >
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <path d="M21 15l-5-5L5 21" />
                          </svg>
                        </div>
                      )}
                      {post.format === "reel" && (
                        <svg
                          viewBox="0 0 24 24"
                          fill="white"
                          className="absolute right-1.5 top-1.5 size-3.5 drop-shadow"
                        >
                          <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4Z" />
                        </svg>
                      )}
                      {post.format === "carousel" && (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          strokeWidth="2"
                          className="absolute right-1.5 top-1.5 size-3.5 drop-shadow"
                        >
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                      {post.posted_at && (
                        <PostedStamp className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 text-[10px]" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section
            aria-labelledby="approval-calendar-heading"
            className="xl:order-1"
          >
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2
                id="approval-calendar-heading"
                className={`${fraunces.className} text-2xl font-medium`}
              >
                {monthLabel}
              </h2>
              <p className="mt-1 text-xs text-[var(--foreground)]/50">
                {mode === "internal"
                  ? collectionView === "archive"
                    ? "Open a published post to review its approvals and publication details."
                    : "Open a post to plan its date, time, caption, and final confirmation."
                  : "Open a post to review the final creative and caption."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {collectionView === "active" && mode === "internal" && canSendToClient && (
                <button
                  type="button"
                  disabled={!readyUnsentForMonth.length || isSending}
                  onClick={() => void sendPostsToClient(readyUnsentForMonth)}
                  className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-xs font-semibold text-[var(--primary-foreground)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSending
                    ? "Sending…"
                    : `Send ${monthLabel} to client${
                        readyUnsentForMonth.length
                          ? ` (${readyUnsentForMonth.length})`
                          : ""
                      }`}
                </button>
              )}
              <button
                type="button"
                aria-label="Previous month"
                onClick={() =>
                  setVisibleMonth(new Date(year, month - 1, 1))
                }
                className="flex size-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)]"
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() =>
                  setVisibleMonth(new Date(year, month + 1, 1))
                }
                className="flex size-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)]"
              >
                →
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--muted)]">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground)]/45"
                  >
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {calendarCells.map((day, index) => {
                  const dateKey = day
                    ? `${year}-${String(month + 1).padStart(2, "0")}-${String(
                        day,
                      ).padStart(2, "0")}`
                    : null;
                  const dayPosts = dateKey
                    ? postsByDate.get(dateKey) ?? []
                    : [];
                  const isDragTarget =
                    mode === "internal" &&
                    Boolean(dateKey) &&
                    dragOverDateKey === dateKey;
                  return (
                    <div
                      key={`${day ?? "blank"}-${index}`}
                      onDragOver={(event) => {
                        if (mode !== "internal" || !dateKey) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDragEnter={(event) => {
                        if (mode !== "internal" || !dateKey) return;
                        event.preventDefault();
                        setDragOverDateKey(dateKey);
                      }}
                      onDragLeave={() => {
                        setDragOverDateKey((current) =>
                          current === dateKey ? null : current,
                        );
                      }}
                      onDrop={(event) => {
                        if (mode !== "internal" || !dateKey) return;
                        event.preventDefault();
                        const postId = event.dataTransfer.getData("text/plain");
                        const post = visiblePosts.find((item) => item.id === postId);
                        setDragOverDateKey(null);
                        setDraggingPostId(null);
                        if (post) void reschedulePost(post, dateKey);
                      }}
                      className={`min-h-32 border-b border-r border-[var(--border)] p-2.5 transition ${
                        isDragTarget
                          ? "bg-[var(--primary)]/10 ring-2 ring-inset ring-[var(--primary)]/40"
                          : ""
                      }`}
                    >
                      {day && (
                        <span className="text-[11px] font-semibold text-[var(--foreground)]/45">
                          {day}
                        </span>
                      )}
                      <div className="mt-2 space-y-2">
                        {dayPosts.map((post) => {
                          const internalState = deriveInternalApprovalState(
                            post.internal_approvals,
                            INTERNAL_REVIEWER_KEYS,
                            post.internal_review_submitted_at,
                          );
                          const clientState = deriveClientApprovalState(
                            post.client_approvals,
                            clientReviewerKeys,
                            post.sent_to_client_at,
                          );
                          const approvalLabel =
                            clientState === "changes_requested"
                              ? "Client changes"
                              : clientState === "pending"
                                ? "Client pending"
                                : clientState === "approved"
                                  ? "Client approved"
                                  : internalState === "pending"
                                    ? "Internal review"
                                    : internalState === "changes_requested"
                                      ? "Internal changes"
                                      : null;
                          const previewUrl = postVisualPreviewUrl(post);
                          return (
                            <button
                              key={post.id}
                              type="button"
                              draggable={
                                mode === "internal" &&
                                !post.posted_at &&
                                post.publishing_status !== "scheduled"
                              }
                              onClick={() =>
                                openPost(post, clientReviewerKeys)
                              }
                              onDragStart={(event) => {
                                event.dataTransfer.setData(
                                  "text/plain",
                                  post.id,
                                );
                                event.dataTransfer.effectAllowed = "move";
                                setDraggingPostId(post.id);
                              }}
                              onDragEnd={() => {
                                setDraggingPostId(null);
                                setDragOverDateKey(null);
                              }}
                              className={`relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] text-left shadow-sm transition hover:border-[var(--primary)] ${
                                mode === "internal" &&
                                !post.posted_at &&
                                post.publishing_status !== "scheduled"
                                  ? "cursor-grab active:cursor-grabbing"
                                  : ""
                              } ${draggingPostId === post.id ? "opacity-40" : ""}`}
                            >
                              <div
                                className="h-14 w-full bg-[var(--muted)] bg-cover bg-center"
                                style={
                                  previewUrl
                                    ? {
                                        backgroundImage: `url("${previewUrl.replaceAll('"', "%22")}")`,
                                      }
                                    : undefined
                                }
                              >
                                {!previewUrl && (
                                  <div className="flex h-full items-center justify-center px-2 text-center text-[8px] leading-tight text-[var(--foreground)]/40">
                                    No visual yet
                                  </div>
                                )}
                              </div>
                              {post.posted_at && (
                                <PostedStamp className="absolute right-1.5 top-1.5 z-10" />
                              )}
                              <div className="p-2.5">
                                <span className="block truncate text-[10px] font-semibold">
                                  {post.title}
                                </span>
                                <span className="mt-1 block text-[9px] text-[var(--foreground)]/45">
                                  {formatLabel(post.format)} · {assigneeDisplayNames(post)[0] ?? "Unassigned"}
                                </span>
                                <span className="mt-1 block text-[9px] text-[var(--foreground)]/45">
                                  {new Intl.DateTimeFormat("en-CA", {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  }).format(new Date(collectionDate(post)!))}
                                </span>
                                <span className="mt-2 block text-[9px] font-semibold text-[var(--primary)]">
                                  {SOCIAL_PRODUCTION_STATUS_LABELS[post.production_status]} ·{" "}
                                  {post.publishing_status === "scheduled"
                                    ? post.scheduling_mode === "manual"
                                      ? "Manual reminder"
                                      : "Automatic"
                                    : SOCIAL_PUBLISHING_STATUS_LABELS[
                                        post.publishing_status
                                      ]}
                                </span>
                                {approvalLabel && (
                                  <span className="mt-1 inline-flex rounded-full bg-[var(--muted)] px-2 py-0.5 text-[8px] font-semibold text-[var(--foreground)]/65">
                                    {approvalLabel}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
        </div>

        {collectionView === "active" && mode === "internal" && unscheduledPosts.length > 0 && (
          <section className="mt-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
              Needs scheduling
            </p>
            <p className="mt-1 text-xs text-[var(--foreground)]/45">
              Drag a post onto a calendar day to give it a date, or open it to
              set an exact date and time.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {unscheduledPosts.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  draggable
                  onClick={() => openPost(post, clientReviewerKeys)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", post.id);
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingPostId(post.id);
                  }}
                  onDragEnd={() => {
                    setDraggingPostId(null);
                    setDragOverDateKey(null);
                  }}
                  className={`cursor-grab rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-4 text-left transition hover:border-[var(--primary)] active:cursor-grabbing ${
                    draggingPostId === post.id ? "opacity-40" : ""
                  }`}
                >
                  <span className="text-sm font-semibold">{post.title}</span>
                  <span className="mt-1 block text-xs text-[var(--foreground)]/45">
                    Submitted{" "}
                    {formatDate(post.internal_review_submitted_at, true)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {!isLoading && visiblePosts.length === 0 && (
          <section className="mt-8 rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center">
            <p className="text-sm font-semibold">
              {collectionView === "archive"
                ? "No published posts are in the Archive yet."
                : mode === "internal"
                  ? "No posts match this calendar view."
                  : "No social media approvals yet."}
            </p>
            <p className="mt-1 text-xs text-[var(--foreground)]/45">
              {collectionView === "archive"
                ? "Posts move here automatically when posted_at is recorded."
                : mode === "internal"
                  ? "Add content or choose another filter to continue."
                  : `Posts sent for ${resolvedClientName}’s review will appear here.`}
            </p>
          </section>
        )}
      </div>

      {isImportOpen && mode === "internal" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
          <button
            type="button"
            aria-label="Close content import"
            className="absolute inset-0 bg-[var(--foreground)]/55 backdrop-blur-sm"
            onClick={() => !isImporting && setIsImportOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="content-import-title"
            className="relative z-10 max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-[24px] bg-[var(--card)] p-5 shadow-2xl sm:p-7"
          >
            <button
              type="button"
              aria-label="Close"
              disabled={isImporting}
              onClick={() => setIsImportOpen(false)}
              className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-[var(--muted)] disabled:opacity-50"
            >
              ×
            </button>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">
              ChatGPT → Content Calendar
            </p>
            <h2
              id="content-import-title"
              className={`${fraunces.className} mt-2 pr-12 text-3xl font-medium`}
            >
              Import content cards
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--foreground)]/55">
              Ask ChatGPT to fill the JSON template, then paste its complete
              response below. Posts, dates, captions, Reel production notes,
              slides, and Story interactions will be created together.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(
                    SOCIAL_CONTENT_IMPORT_EXAMPLE,
                  );
                  setFeedback("JSON template copied for ChatGPT.");
                }}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-semibold"
              >
                Copy JSON template
              </button>
              <button
                type="button"
                onClick={() => setImportDraft(SOCIAL_CONTENT_IMPORT_EXAMPLE)}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-semibold"
              >
                Preview example
              </button>
            </div>
            <label className="mt-5 block text-xs font-semibold">
              ChatGPT JSON
              <textarea
                rows={16}
                autoFocus
                spellCheck={false}
                value={importDraft}
                onChange={(event) => setImportDraft(event.target.value)}
                placeholder={'{\n  "posts": [\n    { "title": "...", "format": "story" }\n  ]\n}'}
                className="mt-2 w-full resize-y rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 font-mono text-xs leading-5"
              />
            </label>
            {importPreview.error && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-[#E4B9B9] bg-[#FFF0F0] px-3 py-2.5 text-xs leading-5 text-[#8B3E3E]"
              >
                {importPreview.error}
              </p>
            )}
            {importPreview.result && (
              <div className="mt-3 rounded-2xl border border-[#BFD8C7] bg-[#EAF5ED] p-4 text-[#356346]">
                <p className="text-sm font-semibold">
                  Ready to create {importPreview.result.posts.length}{" "}
                  {importPreview.result.posts.length === 1 ? "card" : "cards"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {importPreview.result.posts.slice(0, 8).map((post, index) => (
                    <span
                      key={`${post.title}-${index}`}
                      className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-semibold"
                    >
                      {formatLabel(post.format)} · {post.title}
                    </span>
                  ))}
                  {importPreview.result.posts.length > 8 && (
                    <span className="px-2 py-1 text-[10px] font-semibold">
                      +{importPreview.result.posts.length - 8} more
                    </span>
                  )}
                </div>
                {importPreview.result.warnings.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-4 text-[11px] leading-5">
                    {importPreview.result.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-5">
              <button
                type="button"
                disabled={isImporting}
                onClick={() => setIsImportOpen(false)}
                className="rounded-full border border-[var(--border)] px-4 py-2.5 text-xs font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!importPreview.result || isImporting}
                onClick={() => void importPosts()}
                className="rounded-full bg-[var(--foreground)] px-5 py-2.5 text-xs font-semibold text-[var(--background)] disabled:opacity-40"
              >
                {isImporting ? "Importing…" : "Create content cards"}
              </button>
            </div>
          </section>
        </div>
      )}

      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
          <button
            type="button"
            aria-label="Close post details"
            className="absolute inset-0 bg-[var(--foreground)]/55 backdrop-blur-sm"
            onClick={() => setSelectedId(null)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-post-title"
            className="relative z-10 grid max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-[24px] bg-[var(--card)] shadow-2xl md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setSelectedId(null)}
              className="absolute right-4 top-4 z-20 flex size-9 items-center justify-center rounded-full bg-[var(--card)] shadow"
            >
              ×
            </button>

            <div className="relative bg-[var(--muted)] p-4 sm:p-6">
              {selectedReelVideoUrls ? (
                <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl bg-black shadow-sm">
                  <iframe
                    src={selectedReelVideoUrls.previewUrl}
                    title={`${selectedPost.title} Reel video`}
                    loading="lazy"
                    allow="autoplay; fullscreen"
                    allowFullScreen
                    className="h-full w-full"
                  />
                  <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-[var(--foreground)]/75 px-2.5 py-1 text-[10px] font-semibold text-white">
                    Reel · Video
                  </span>
                </div>
              ) : (
                <div
                  className="relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl bg-[var(--background)] bg-cover bg-center shadow-sm"
                  style={
                    visualPreviewUrl(
                      selectedPost.task_slides[selectedSlide]?.image_url ||
                        selectedPost.creative_drive_link,
                    )
                      ? {
                          backgroundImage: `url("${visualPreviewUrl(
                            selectedPost.task_slides[selectedSlide]?.image_url ||
                              selectedPost.creative_drive_link,
                          )!.replaceAll('"', "%22")}")`,
                        }
                      : undefined
                  }
                >
                  {!visualPreviewUrl(
                    selectedPost.task_slides[selectedSlide]?.image_url ||
                      selectedPost.creative_drive_link,
                  ) && (
                    <div className="max-w-sm p-8 text-center">
                      <p className={`${fraunces.className} text-2xl font-medium`}>
                        {selectedPost.task_slides[selectedSlide]
                          ?.on_screen_text || selectedPost.title}
                      </p>
                      <p className="mt-4 text-xs text-[var(--foreground)]/45">
                        Final visual pending
                      </p>
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full bg-[var(--foreground)]/75 px-2.5 py-1 text-[10px] font-semibold text-white">
                    {formatLabel(selectedPost.format)}
                    {selectedPost.task_slides.length > 0
                      ? ` · Slide ${selectedSlide + 1} of ${
                          selectedPost.task_slides.length
                        }`
                      : ""}
                  </span>
                </div>
              )}
              {selectedPost.format !== "reel" &&
                selectedPost.task_slides.length > 1 && (
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {selectedPost.task_slides.map((slide, index) => (
                    <button
                      key={slide.id}
                      type="button"
                      onClick={() => setSelectedSlide(index)}
                      className={`rounded-xl border p-2 text-left text-[10px] ${
                        selectedSlide === index
                          ? "border-[var(--primary)] bg-[var(--card)]"
                          : "border-transparent bg-[var(--card)]/60"
                      }`}
                    >
                      Slide {index + 1}
                    </button>
                  ))}
                </div>
              )}
              {mode === "internal" && selectedPost.format !== "reel" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={selectedSlide === 0 || isSaving}
                    onClick={() => void moveSlide(selectedPost, -1)}
                    className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[10px] font-semibold disabled:opacity-40"
                  >
                    Move left
                  </button>
                  <button
                    type="button"
                    disabled={
                      selectedSlide >= selectedPost.task_slides.length - 1 ||
                      isSaving
                    }
                    onClick={() => void moveSlide(selectedPost, 1)}
                    className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[10px] font-semibold disabled:opacity-40"
                  >
                    Move right
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void addSlide(selectedPost)}
                    className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[10px] font-semibold disabled:opacity-40"
                  >
                    + Add slide
                  </button>
                </div>
              )}
              {selectedPost.posted_at && (
                <PostedStamp className="absolute right-8 top-8 z-10 px-4 py-2 text-xs" />
              )}
              {selectedPost.creative_drive_link && (
                <a
                  href={selectedPost.creative_drive_link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[10px] font-semibold underline underline-offset-2"
                >
                  Open creative in Google Drive ↗
                </a>
              )}
            </div>

            <div className="p-5 sm:p-7 md:p-8">
              {mode === "internal" && (
                <div className="sticky top-0 z-10 mb-5 mr-12 grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 p-3 shadow-sm backdrop-blur sm:grid-cols-2">
                  <div
                    aria-live="polite"
                    className="rounded-xl bg-[var(--muted)] px-3 py-2.5"
                  >
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground)]/50">
                      Current phase
                    </span>
                    <span className="mt-1.5 flex items-center gap-2 text-sm font-semibold">
                      <span className="size-2 rounded-full bg-[var(--primary)]" />
                      {currentWorkflowPhaseOption?.label ?? "1. Planning"}
                    </span>
                  </div>
                  <label>
                    <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--foreground)]/50">
                      View section
                    </span>
                    <select
                      value={activeModalPhase}
                      onChange={(event) =>
                        setActiveModalPhase(event.target.value as ModalPhase)
                      }
                      className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-semibold"
                    >
                      {MODAL_PHASES.map((phase) => (
                        <option key={phase.value} value={phase.value}>
                          {phase.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground)]/45">
                  {formatLabel(selectedPost.format)} ·{" "}
                  {formatDate(selectedPost.scheduled_at, true)}
                </p>
                {selectedPost.posted_at && mode === "client" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF5ED] px-2.5 py-1 text-[10px] font-semibold text-[#267149]">
                    <span className="size-1.5 rounded-full bg-[#3A9B63]" />
                    Archived
                  </span>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${approvalDisplayStyle(selectedPost, mode, requiredReviewers, clientReviewerKeys).pill}`}
                  >
                    {
                      approvalDisplayStyle(
                        selectedPost,
                        mode,
                        requiredReviewers,
                        clientReviewerKeys,
                      ).label
                    }
                  </span>
                )}
                {selectedPost.sent_to_client_at &&
                  !selectedPost.posted_at &&
                  mode === "internal" && (
                  <span className="rounded-full bg-[#EDF2FF] px-2.5 py-1 text-[10px] font-semibold text-[#405A91]">
                    Sent to client
                  </span>
                )}
              </div>

              <h2
                id="approval-post-title"
                className={`${fraunces.className} mt-4 text-3xl font-medium`}
              >
                {selectedPost.title}
              </h2>
              {mode === "internal" &&
                assigneeDisplayNames(selectedPost).length > 0 && (
                  <p className="mt-1 text-xs text-[var(--foreground)]/50">
                    Assigned to {assigneeDisplayNames(selectedPost).join(", ")}
                  </p>
                )}

              {mode === "internal" ? (
                <div className="mt-6 grid gap-4">
                  {contentDraft && (
                    <>
                      <section
                        className={`grid gap-3 rounded-2xl border border-[var(--border)] p-4 ${
                          activeModalPhase === "planning" ? "" : "hidden"
                        }`}
                      >
                        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
                          Planning
                        </h3>
                        <label className="text-xs font-semibold">
                          Content title
                          <input
                            value={contentDraft.title}
                            onChange={(event) =>
                              setContentDraft({
                                ...contentDraft,
                                title: event.target.value,
                              })
                            }
                            className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                          />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-semibold">
                            Format
                            <select
                              value={contentDraft.format}
                              onChange={(event) =>
                                setContentDraft({
                                  ...contentDraft,
                                  format: event.target.value,
                                })
                              }
                              className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                            >
                              <option value="reel">Reel</option>
                              <option value="carousel">Carousel</option>
                              <option value="image">Image</option>
                              <option value="story">Story</option>
                            </select>
                          </label>
                          <label className="text-xs font-semibold">
                            Platform
                            <input
                              value={contentDraft.platform}
                              onChange={(event) =>
                                setContentDraft({
                                  ...contentDraft,
                                  platform: event.target.value,
                                })
                              }
                              placeholder="Instagram"
                              className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                            />
                          </label>
                        </div>
                        <label className="text-xs font-semibold">
                          Purpose / content goal
                          <textarea
                            rows={3}
                            value={contentDraft.purpose}
                            onChange={(event) =>
                              setContentDraft({
                                ...contentDraft,
                                purpose: event.target.value,
                              })
                            }
                            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm"
                          />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-xs font-semibold">
                            Content pillar / campaign
                            <input
                              value={contentDraft.contentPillar}
                              onChange={(event) =>
                                setContentDraft({
                                  ...contentDraft,
                                  contentPillar: event.target.value,
                                })
                              }
                              className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                            />
                          </label>
                          <label className="text-xs font-semibold">
                            Target audience
                            <input
                              value={contentDraft.targetAudience}
                              onChange={(event) =>
                                setContentDraft({
                                  ...contentDraft,
                                  targetAudience: event.target.value,
                                })
                              }
                              className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                            />
                          </label>
                          <label className="text-xs font-semibold">
                            CTA
                            <input
                              value={contentDraft.cta}
                              onChange={(event) =>
                                setContentDraft({
                                  ...contentDraft,
                                  cta: event.target.value,
                                })
                              }
                              className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                            />
                          </label>
                          <label className="text-xs font-semibold">
                            Internal production deadline
                            <input
                              type="date"
                              value={contentDraft.dueDate}
                              onChange={(event) =>
                                setContentDraft({
                                  ...contentDraft,
                                  dueDate: event.target.value,
                                })
                              }
                              className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                            />
                          </label>
                        </div>
                      </section>

                      <section
                        className={`grid gap-3 rounded-2xl border border-[var(--border)] p-4 ${
                          activeModalPhase === "creative" ? "" : "hidden"
                        }`}
                      >
                        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
                          Creative direction
                        </h3>
                        <label className="text-xs font-semibold">
                          Brief
                          <textarea
                            rows={4}
                            value={contentDraft.brief}
                            onChange={(event) =>
                              setContentDraft({
                                ...contentDraft,
                                brief: event.target.value,
                              })
                            }
                            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm"
                          />
                        </label>
                        <label className="text-xs font-semibold">
                          Visual direction
                          <textarea
                            rows={3}
                            value={contentDraft.visualNote}
                            onChange={(event) =>
                              setContentDraft({
                                ...contentDraft,
                                visualNote: event.target.value,
                              })
                            }
                            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm"
                          />
                        </label>
                        {contentDraft.format === "story" && (
                          <div className="grid gap-3 rounded-xl border border-[var(--primary)]/25 bg-[var(--muted)] p-3">
                            <div>
                              <p className="text-xs font-semibold">
                                Story interaction
                              </p>
                              <p className="mt-1 text-[11px] leading-5 text-[var(--foreground)]/50">
                                Record the exact sticker, prompt, and choices the
                                person publishing the Story should add.
                              </p>
                            </div>
                            <label className="text-xs font-semibold">
                              Interaction type
                              <select
                                value={contentDraft.storyInteraction.type}
                                onChange={(event) =>
                                  setContentDraft({
                                    ...contentDraft,
                                    storyInteraction: {
                                      ...contentDraft.storyInteraction,
                                      type: event.target
                                        .value as StoryInteraction["type"],
                                    },
                                  })
                                }
                                className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                              >
                                {STORY_INTERACTION_TYPES.map((type) => (
                                  <option key={type} value={type}>
                                    {STORY_INTERACTION_TYPE_LABELS[type]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {contentDraft.storyInteraction.type !== "none" && (
                              <>
                                <label className="text-xs font-semibold">
                                  Prompt / sticker copy
                                  <textarea
                                    rows={3}
                                    value={contentDraft.storyInteraction.prompt}
                                    onChange={(event) =>
                                      setContentDraft({
                                        ...contentDraft,
                                        storyInteraction: {
                                          ...contentDraft.storyInteraction,
                                          prompt: event.target.value,
                                        },
                                      })
                                    }
                                    placeholder="e.g. What should we share more of?"
                                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm font-normal"
                                  />
                                </label>
                                <label className="text-xs font-semibold">
                                  Poll / quiz choices or extra instructions
                                  <textarea
                                    rows={3}
                                    value={contentDraft.storyInteraction.options.join(
                                      "\n",
                                    )}
                                    onChange={(event) =>
                                      setContentDraft({
                                        ...contentDraft,
                                        storyInteraction: {
                                          ...contentDraft.storyInteraction,
                                          options: event.target.value
                                            .split("\n")
                                            .map((value) => value.trim())
                                            .filter(Boolean),
                                        },
                                      })
                                    }
                                    placeholder="One choice or instruction per line"
                                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm font-normal"
                                  />
                                </label>
                              </>
                            )}
                          </div>
                        )}
                        {contentDraft.format === "reel" && (
                          <div className="grid gap-3 rounded-xl bg-[var(--muted)] p-3">
                            <label className="text-xs font-semibold">
                              Reel hook
                              <input
                                value={contentDraft.reelDetails.hook}
                                onChange={(event) =>
                                  setContentDraft({
                                    ...contentDraft,
                                    reelDetails: {
                                      ...contentDraft.reelDetails,
                                      hook: event.target.value,
                                    },
                                  })
                                }
                                className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                              />
                            </label>
                            <label className="text-xs font-semibold">
                              Reel script
                              <textarea
                                rows={5}
                                value={contentDraft.reelDetails.script}
                                onChange={(event) =>
                                  setContentDraft({
                                    ...contentDraft,
                                    reelDetails: {
                                      ...contentDraft.reelDetails,
                                      script: event.target.value,
                                    },
                                  })
                                }
                                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm"
                              />
                            </label>
                            {[
                              ["shotList", "Shot list"],
                              ["editingFlow", "Editing flow"],
                              ["onScreenText", "On-screen text"],
                            ].map(([field, label]) => (
                              <label key={field} className="text-xs font-semibold">
                                {label}
                                <textarea
                                  rows={3}
                                  value={
                                    contentDraft.reelDetails[
                                      field as
                                        | "shotList"
                                        | "editingFlow"
                                        | "onScreenText"
                                    ]
                                  }
                                  onChange={(event) =>
                                    setContentDraft({
                                      ...contentDraft,
                                      reelDetails: {
                                        ...contentDraft.reelDetails,
                                        [field]: event.target.value,
                                      },
                                    })
                                  }
                                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm"
                                />
                              </label>
                            ))}
                            <label className="text-xs font-semibold">
                              Reel CTA
                              <input
                                value={contentDraft.reelDetails.cta}
                                onChange={(event) =>
                                  setContentDraft({
                                    ...contentDraft,
                                    reelDetails: {
                                      ...contentDraft.reelDetails,
                                      cta: event.target.value,
                                    },
                                  })
                                }
                                className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                              />
                            </label>
                            <label className="text-xs font-semibold">
                              Draft / final Reel deliverable link
                              <input
                                type="url"
                                value={contentDraft.reelDetails.videoUrl}
                                onChange={(event) =>
                                  setContentDraft({
                                    ...contentDraft,
                                    reelDetails: {
                                      ...contentDraft.reelDetails,
                                      videoUrl: event.target.value,
                                    },
                                  })
                                }
                                className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                              />
                            </label>
                          </div>
                        )}
                      </section>
                    </>
                  )}
                  {activeModalPhase === "creative" &&
                    (selectedPost.format === "carousel" ||
                      selectedPost.format === "image" ||
                      selectedPost.format === "story") &&
                    selectedPost.task_slides[selectedSlide] && (
                      <section className="grid gap-3 rounded-2xl border border-[var(--primary)]/25 bg-[var(--muted)]/55 p-4">
                        <h3 className="text-xs font-semibold">
                          {selectedPost.format === "carousel"
                            ? `Slide ${selectedSlide + 1}`
                            : "Image creative"}
                        </h3>
                        <label className="text-xs font-semibold">
                          On-screen text
                          <textarea
                            rows={3}
                            value={
                              slideTextDrafts[
                                selectedPost.task_slides[selectedSlide].id
                              ] ?? ""
                            }
                            onChange={(event) => {
                              const slideId =
                                selectedPost.task_slides[selectedSlide].id;
                              setSlideTextDrafts((current) => ({
                                ...current,
                                [slideId]: event.target.value,
                              }));
                            }}
                            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm font-normal"
                          />
                        </label>
                        <label className="text-xs font-semibold">
                          Per-slide visual direction
                          <textarea
                            rows={3}
                            value={
                              slideVisualDrafts[
                                selectedPost.task_slides[selectedSlide].id
                              ] ?? ""
                            }
                            onChange={(event) => {
                              const slideId =
                                selectedPost.task_slides[selectedSlide].id;
                              setSlideVisualDrafts((current) => ({
                                ...current,
                                [slideId]: event.target.value,
                              }));
                            }}
                            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm font-normal"
                          />
                        </label>
                        <label className="text-xs font-semibold">
                          Per-slide caption
                          <textarea
                            rows={4}
                            value={
                              slideCaptionDrafts[
                                selectedPost.task_slides[selectedSlide].id
                              ] ?? ""
                            }
                            onChange={(event) => {
                              const slideId =
                                selectedPost.task_slides[selectedSlide].id;
                              setSlideCaptionDrafts((current) => ({
                                ...current,
                                [slideId]: event.target.value,
                              }));
                            }}
                            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm font-normal"
                          />
                        </label>
                        <div>
                          <p className="text-xs font-semibold">References</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedPost.task_slides[
                              selectedSlide
                            ].slide_references.map((reference) => (
                              <a
                                key={reference.id}
                                href={reference.url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-full bg-[var(--background)] px-3 py-1.5 text-[10px] font-semibold underline"
                              >
                                {reference.platform}
                              </a>
                            ))}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <input
                              type="url"
                              value={slideReferenceDraft}
                              onChange={(event) =>
                                setSlideReferenceDraft(event.target.value)
                              }
                              placeholder="Paste a reference link"
                              className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                void addSlideReference(
                                  selectedPost,
                                  selectedPost.task_slides[selectedSlide],
                                )
                              }
                              className="rounded-xl border border-[var(--border)] px-3 text-xs font-semibold"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </section>
                    )}
                  {contentDraft?.format !== "carousel" && (
                    <label
                      className={`text-xs font-semibold ${
                        activeModalPhase === "creative" ? "" : "hidden"
                      }`}
                    >
                      Final caption
                      <textarea
                        rows={8}
                        disabled={
                          Boolean(selectedPost.posted_at) ||
                          selectedPost.publishing_status === "scheduled"
                        }
                        value={captionDraft}
                        onChange={(event) => setCaptionDraft(event.target.value)}
                        className="mt-2 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm leading-6"
                      />
                    </label>
                  )}
                  {contentDraft && (
                    <>
                      <section
                        className={`grid gap-3 rounded-2xl border border-[var(--border)] p-4 ${
                          activeModalPhase === "production" ? "" : "hidden"
                        }`}
                      >
                        <label className="flex items-center justify-between gap-3 text-xs font-semibold">
                          <span>
                            Filming
                            <span className="mt-1 block font-normal text-[var(--foreground)]/45">
                              Keep raw footage separate from the final deliverable.
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            checked={contentDraft.requiresFilming}
                            onChange={(event) =>
                              setContentDraft({
                                ...contentDraft,
                                requiresFilming: event.target.checked,
                              })
                            }
                            className="size-5"
                          />
                        </label>
                        {contentDraft.requiresFilming && (
                          <div className="grid gap-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="text-xs font-semibold">
                                Filming date
                                <input
                                  type="date"
                                  value={contentDraft.filmingDetails.filmingDate}
                                  onChange={(event) =>
                                    setContentDraft({
                                      ...contentDraft,
                                      filmingDetails: {
                                        ...contentDraft.filmingDetails,
                                        filmingDate: event.target.value,
                                      },
                                    })
                                  }
                                  className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                                />
                              </label>
                              <label className="text-xs font-semibold">
                                Participants
                                <input
                                  value={contentDraft.filmingDetails.participants.join(", ")}
                                  onChange={(event) =>
                                    setContentDraft({
                                      ...contentDraft,
                                      filmingDetails: {
                                        ...contentDraft.filmingDetails,
                                        participants: event.target.value
                                          .split(",")
                                          .map((value) => value.trim())
                                          .filter(Boolean),
                                      },
                                    })
                                  }
                                  placeholder="Names separated by commas"
                                  className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                                />
                              </label>
                            </div>
                            <label className="flex items-center gap-2 text-xs font-semibold">
                              <input
                                type="checkbox"
                                checked={contentDraft.filmingDetails.needsModels}
                                onChange={(event) =>
                                  setContentDraft({
                                    ...contentDraft,
                                    filmingDetails: {
                                      ...contentDraft.filmingDetails,
                                      needsModels: event.target.checked,
                                    },
                                  })
                                }
                              />
                              Models required
                            </label>
                            {[
                              ["preparation", "Preparation and props"],
                              ["script", "Filming script"],
                              ["shotList", "Shot list / filming instructions"],
                            ].map(([field, label]) => (
                              <label key={field} className="text-xs font-semibold">
                                {label}
                                <textarea
                                  rows={3}
                                  value={
                                    contentDraft.filmingDetails[
                                      field as "preparation" | "script" | "shotList"
                                    ]
                                  }
                                  onChange={(event) =>
                                    setContentDraft({
                                      ...contentDraft,
                                      filmingDetails: {
                                        ...contentDraft.filmingDetails,
                                        [field]: event.target.value,
                                      },
                                    })
                                  }
                                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm"
                                />
                              </label>
                            ))}
                            <label className="text-xs font-semibold">
                              Raw footage links
                              <textarea
                                rows={3}
                                value={contentDraft.filmingDetails.rawFootageLinks.join("\n")}
                                onChange={(event) =>
                                  setContentDraft({
                                    ...contentDraft,
                                    filmingDetails: {
                                      ...contentDraft.filmingDetails,
                                      rawFootageLinks: event.target.value
                                        .split("\n")
                                        .map((value) => value.trim())
                                        .filter(Boolean),
                                    },
                                  })
                                }
                                placeholder="One link per line"
                                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm"
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs font-semibold">
                              <input
                                type="checkbox"
                                checked={contentDraft.filmingDetails.filmed}
                                onChange={(event) =>
                                  setContentDraft({
                                    ...contentDraft,
                                    filmingDetails: {
                                      ...contentDraft.filmingDetails,
                                      filmed: event.target.checked,
                                    },
                                  })
                                }
                              />
                              Filmed
                            </label>
                          </div>
                        )}
                      </section>

                      <section
                        className={`grid gap-4 rounded-2xl border border-[var(--border)] p-4 ${
                          activeModalPhase === "scheduling" ? "" : "hidden"
                        }`}
                      >
                        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
                          Scheduling
                        </h3>
                        <label className="text-xs font-semibold">
                          Planned publishing date and time
                          <input
                            type="datetime-local"
                            disabled={
                              Boolean(selectedPost.posted_at) ||
                              selectedPost.publishing_status === "scheduled"
                            }
                            value={scheduleDraft}
                            onChange={(event) =>
                              setScheduleDraft(event.target.value)
                            }
                            className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                          />
                        </label>
                        <fieldset>
                          <legend className="text-xs font-semibold">
                            Publishing method
                          </legend>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {SOCIAL_SCHEDULING_MODES.map((schedulingMode) => (
                              <label
                                key={schedulingMode}
                                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-xs ${
                                  contentDraft.schedulingMode === schedulingMode
                                    ? "border-[var(--primary)] bg-[var(--muted)]"
                                    : "border-[var(--border)]"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`scheduling-mode-${selectedPost.id}`}
                                  value={schedulingMode}
                                  disabled={
                                    Boolean(selectedPost.posted_at) ||
                                    selectedPost.publishing_status === "scheduled"
                                  }
                                  checked={
                                    contentDraft.schedulingMode === schedulingMode
                                  }
                                  onChange={() =>
                                    setContentDraft({
                                      ...contentDraft,
                                      schedulingMode,
                                    })
                                  }
                                  className="mt-0.5"
                                />
                                <span>
                                  <span className="block font-semibold">
                                    {SOCIAL_SCHEDULING_MODE_LABELS[schedulingMode]}
                                  </span>
                                  <span className="mt-1 block font-normal leading-5 text-[var(--foreground)]/50">
                                    {schedulingMode === "automatic"
                                      ? "Queue it in Meta or the publishing platform to auto-publish."
                                      : "For Stories or other posts that need a person. Slack will send the creative when it is time to post."}
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        {contentDraft.schedulingMode === "automatic" && (
                          <div className="rounded-xl border border-[#A9CDD5] bg-[#E8F4F7] p-3">
                            <label className="flex cursor-pointer items-center justify-between gap-4">
                              <span>
                                <span className="block text-sm font-semibold text-[#2F6470]">
                                  Scheduled in Meta
                                </span>
                                <span className="mt-1 block text-[11px] leading-5 text-[#2F6470]/70">
                                  {selectedPost.publishing_status ===
                                    "scheduled" &&
                                  selectedPost.scheduling_mode === "automatic"
                                    ? "Confirmed — this post is queued for automatic publishing."
                                    : !hasCompletedClientApproval(selectedPost)
                                      ? "Complete client approval before confirming the Meta schedule."
                                      : !scheduleDraft
                                        ? "Choose the publishing date and time first."
                                        : "Check this after you have queued the post in Meta."}
                                </span>
                              </span>
                              <input
                                type="checkbox"
                                aria-label="Scheduled in Meta"
                                checked={
                                  selectedPost.publishing_status ===
                                    "scheduled" &&
                                  selectedPost.scheduling_mode === "automatic"
                                }
                                disabled={
                                  !currentReviewer ||
                                  isSaving ||
                                  Boolean(selectedPost.posted_at) ||
                                  (selectedPost.publishing_status !==
                                    "scheduled" &&
                                    (!hasCompletedClientApproval(selectedPost) ||
                                      !scheduleDraft))
                                }
                                onChange={(event) =>
                                  void setScheduledState(
                                    selectedPost,
                                    event.target.checked,
                                  )
                                }
                                className="size-5 shrink-0 accent-[#2F6470]"
                              />
                            </label>
                          </div>
                        )}
                        {selectedPost.scheduling_mode === "manual" &&
                          selectedPost.manual_reminder_sent_at && (
                            <p className="rounded-xl bg-[#EAF5ED] px-3 py-2.5 text-xs font-semibold text-[#267149]">
                              Slack reminder sent on {formatDate(
                                selectedPost.manual_reminder_sent_at,
                                true,
                              )}.
                            </p>
                          )}
                      </section>

                      <section
                        className={`grid gap-3 rounded-2xl border border-[var(--border)] p-4 ${
                          activeModalPhase === "production" ? "" : "hidden"
                        }`}
                      >
                        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
                          Production and assignment
                        </h3>
                        <label className="text-xs font-semibold">
                          Production status
                          <select
                            value={contentDraft.productionStatus}
                            onChange={(event) =>
                              setContentDraft({
                                ...contentDraft,
                                productionStatus: event.target
                                  .value as SocialProductionStatus,
                              })
                            }
                            className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                          >
                            {SOCIAL_PRODUCTION_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {SOCIAL_PRODUCTION_STATUS_LABELS[status]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs font-semibold">
                          Creative Google Drive link
                          <input
                            type="url"
                            value={contentDraft.creativeDriveLink}
                            onChange={(event) =>
                              setContentDraft({
                                ...contentDraft,
                                creativeDriveLink: event.target.value,
                              })
                            }
                            placeholder="https://drive.google.com/..."
                            className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-normal"
                          />
                          <span className="mt-2 block text-[11px] font-normal leading-5 text-[var(--foreground)]/50">
                            Paste the final creative file or folder link and make
                            sure “Anyone with the link can view” is enabled.
                          </span>
                        </label>
                        <fieldset>
                          <legend className="text-xs font-semibold">Assignees</legend>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {Object.values(TEAM_IDENTITIES).map((profile) => (
                              <label
                                key={profile.username}
                                className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-xs"
                              >
                                <input
                                  type="checkbox"
                                  checked={contentDraft.assigneeUsernames.includes(
                                    profile.username,
                                  )}
                                  onChange={() =>
                                    setContentDraft({
                                      ...contentDraft,
                                      assigneeUsernames:
                                        contentDraft.assigneeUsernames.includes(
                                          profile.username,
                                        )
                                          ? contentDraft.assigneeUsernames.filter(
                                              (username) =>
                                                username !== profile.username,
                                            )
                                          : [
                                              ...contentDraft.assigneeUsernames,
                                              profile.username,
                                            ],
                                    })
                                  }
                                />
                                {profile.name}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <p className="text-[11px] leading-5 text-[var(--foreground)]/50">
                          Watchers: {selectedPost.watcher_usernames.join(", ") || "None"}
                          <br />Mentions: {selectedPost.mentioned_usernames.join(", ") || "None"}
                        </p>
                        {(deriveInternalApprovalState(
                          selectedPost.internal_approvals,
                          INTERNAL_REVIEWER_KEYS,
                          selectedPost.internal_review_submitted_at,
                        ) === "not_submitted" ||
                          selectedPost.production_status ===
                            "changes_required") && (
                          <button
                            type="button"
                            disabled={
                              isSaving ||
                              Boolean(selectedPost.posted_at) ||
                              selectedPost.publishing_status === "scheduled"
                            }
                            onClick={() =>
                              void saveAndSubmitForInternalReview(selectedPost)
                            }
                            className="mt-1 w-full rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-40"
                          >
                            {isSaving
                              ? "Saving & submitting…"
                              : "Submit for review"}
                          </button>
                        )}
                      </section>

                      <section
                        className={`grid gap-3 rounded-2xl border border-[var(--border)] p-4 ${
                          activeModalPhase === "publishing" ? "" : "hidden"
                        }`}
                      >
                        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
                          Publishing
                        </h3>
                        <p className="text-xs">
                          Status: <strong>{SOCIAL_PUBLISHING_STATUS_LABELS[selectedPost.publishing_status]}</strong>
                        </p>
                        <label className="text-xs font-semibold">
                          Live post URL
                          <input
                            type="url"
                            value={contentDraft.livePostUrl}
                            onChange={(event) =>
                              setContentDraft({
                                ...contentDraft,
                                livePostUrl: event.target.value,
                              })
                            }
                            className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                          />
                        </label>
                      </section>
                    </>
                  )}
                  {activeModalPhase !== "approval" && (
                    <button
                      type="button"
                      disabled={
                        Boolean(selectedPost.posted_at) ||
                        (selectedPost.publishing_status === "scheduled" &&
                          activeModalPhase !== "publishing") ||
                        isSaving
                      }
                      onClick={() => void savePlanning(selectedPost)}
                      className="w-fit rounded-full border border-[var(--border)] px-4 py-2 text-xs font-semibold hover:bg-[var(--muted)] disabled:opacity-50"
                    >
                      {isSaving ? "Saving…" : "Save changes"}
                    </button>
                  )}
                  {activeModalPhase === "approval" && (
                    <button
                      type="button"
                      disabled={
                        Boolean(selectedPost.posted_at) ||
                        selectedPost.publishing_status === "scheduled" ||
                        !currentReviewer ||
                        isSaving
                      }
                      aria-pressed={selectedPost.final_confirmed}
                      onClick={() => void toggleFinalConfirmation(selectedPost)}
                      className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                        selectedPost.final_confirmed
                          ? "border-[#8DB39A] bg-[#EAF5ED]"
                          : "border-[var(--border)] bg-[var(--background)]"
                      }`}
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center rounded border border-current text-xs">
                        {selectedPost.final_confirmed ? "✓" : ""}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">
                          Final content confirmed
                        </span>
                        <span className="mt-1 block text-xs text-[var(--foreground)]/50">
                          {selectedPost.final_confirmed
                            ? `Confirmed by ${
                                selectedPost.final_confirmed_by ?? "the team"
                              }`
                            : "Confirm the creative, schedule, and caption are client-ready."}
                        </span>
                      </span>
                    </button>
                  )}
                  <div className="border-t border-[var(--border)] pt-4">
                    <button
                      type="button"
                      disabled={isSaving || isDeleting}
                      onClick={() => setPostToDelete(selectedPost)}
                      className="rounded-full border border-[#E2BABA] bg-white px-4 py-2 text-xs font-semibold text-[#9A4040] transition hover:bg-[#FFF0F0] disabled:opacity-50"
                    >
                      Delete card
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  {selectedPost.format === "carousel" &&
                    selectedPost.task_slides[selectedSlide] && (
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/50 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground)]/40">
                          Slide {selectedSlide + 1} caption
                        </p>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--foreground)]/75">
                          {selectedPost.task_slides[selectedSlide]
                            .slide_caption || "No caption added for this slide."}
                        </p>
                      </div>
                    )}
                  {selectedPost.format !== "carousel" && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground)]/40">
                        Caption
                      </p>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--foreground)]/75">
                        {selectedPost.post_caption}
                      </p>
                    </div>
                  )}
                  {selectedPost.format === "story" &&
                    selectedPost.story_interaction.type !== "none" && (
                      <div className="rounded-2xl border border-[var(--primary)]/25 bg-[var(--muted)]/50 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground)]/40">
                          Story interaction ·{" "}
                          {
                            STORY_INTERACTION_TYPE_LABELS[
                              selectedPost.story_interaction.type
                            ]
                          }
                        </p>
                        <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-[var(--foreground)]/75">
                          {selectedPost.story_interaction.prompt ||
                            "No sticker copy added."}
                        </p>
                        {selectedPost.story_interaction.options.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedPost.story_interaction.options.map(
                              (option, index) => (
                                <span
                                  key={`${option}-${index}`}
                                  className="rounded-full bg-[var(--card)] px-3 py-1.5 text-xs"
                                >
                                  {option}
                                </span>
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    )}
                </div>
              )}

              {mode === "internal" &&
                activeModalPhase === "approval" &&
                (deriveInternalApprovalState(
                  selectedPost.internal_approvals,
                  INTERNAL_REVIEWER_KEYS,
                  selectedPost.internal_review_submitted_at,
                ) === "not_submitted" ||
                  selectedPost.production_status === "changes_required") && (
                  <button
                    type="button"
                    disabled={isSaving || Boolean(selectedPost.posted_at)}
                    onClick={() =>
                      void saveAndSubmitForInternalReview(selectedPost)
                    }
                    className="mt-7 w-full rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-40"
                  >
                    Submit for review
                  </button>
                )}

              {(mode === "client" || activeModalPhase === "approval") && (
                <div className="mt-7">
                  <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--foreground)]/55">
                    Review and approval
                  </h3>
                  <span className="text-[10px] text-[var(--foreground)]/40">
                    {requiredReviewers.length}{" "}
                    {requiredReviewers.length === 1 ? "person" : "people"} required
                  </span>
                  </div>
                  {mode === "internal" && (
                  <div className="mt-3 grid gap-2 rounded-xl bg-[var(--muted)] p-3 text-xs sm:grid-cols-2">
                    <p>
                      Internal: <strong>{approvalStateLabel(
                        deriveInternalApprovalState(
                          selectedPost.internal_approvals,
                          INTERNAL_REVIEWER_KEYS,
                          selectedPost.internal_review_submitted_at,
                        ),
                      )}</strong>
                    </p>
                    <p>
                      Client: <strong>{approvalStateLabel(
                        deriveClientApprovalState(
                          selectedPost.client_approvals,
                          clientReviewerKeys,
                          selectedPost.sent_to_client_at,
                        ),
                      )}</strong>
                    </p>
                  </div>
                  )}
                  <div className="mt-3 grid gap-3">
                  {requiredReviewers.map((reviewer) => {
                    const review = reviewFor(selectedPost, mode, reviewer.key);
                    return (
                      <article
                        key={reviewer.key}
                        className={`rounded-xl border p-4 ${
                          reviewer.key === currentReviewer?.key
                            ? "border-[var(--primary)]/35 bg-[var(--muted)]"
                            : "border-[var(--border)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span
                              className={`${fraunces.className} flex size-9 items-center justify-center rounded-full bg-[var(--muted)] text-sm font-semibold`}
                            >
                              {reviewer.initials}
                            </span>
                            <div>
                              <p className="text-sm font-semibold">
                                {reviewer.name}
                                {reviewer.key === currentReviewer?.key
                                  ? " (you)"
                                  : ""}
                              </p>
                              <p className="text-[11px] text-[var(--foreground)]/45">
                                {reviewer.role}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${reviewStyles[review.status].pill}`}
                          >
                            {statusIcon(review.status)}{" "}
                            {reviewStyles[review.status].label}
                          </span>
                        </div>
                        {review.reviewed_at && (
                          <p className="mt-3 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--foreground)]/45">
                            Last action: {formatDate(review.reviewed_at, true)}
                          </p>
                        )}
                        {review.comment && (
                          <p className="mt-3 rounded-lg bg-[#F4E7E2] px-3 py-2.5 text-xs leading-5 text-[#754A3E]">
                            {review.comment}
                          </p>
                        )}
                      </article>
                    );
                  })}
                  </div>
                </div>
              )}

              {mode === "internal" &&
                activeModalPhase === "approval" &&
                Object.keys(selectedPost.client_approvals).length > 0 && (
                  <div className="mt-7 border-t border-[var(--border)] pt-6">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--foreground)]/55">
                      Client feedback
                    </h3>
                    <div className="mt-3 grid gap-3">
                      {Object.entries(selectedPost.client_approvals).map(
                        ([key, review]) => (
                          <article
                            key={key}
                            className="rounded-xl border border-[var(--border)] p-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold">
                                {review.reviewer_name ?? key}
                              </p>
                              <span
                                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${reviewStyles[review.status].pill}`}
                              >
                                {statusIcon(review.status)}{" "}
                                {reviewStyles[review.status].label}
                              </span>
                            </div>
                            {review.reviewed_at && (
                              <p className="mt-2 text-[11px] text-[var(--foreground)]/45">
                                {formatDate(review.reviewed_at, true)}
                              </p>
                            )}
                            {review.comment && (
                              <p className="mt-3 rounded-lg bg-[#F4E7E2] px-3 py-2.5 text-xs leading-5 text-[#754A3E]">
                                {review.comment}
                              </p>
                            )}
                          </article>
                        ),
                      )}
                    </div>
                  </div>
                )}

              {selectedApprovalHistory.length > 0 &&
                (mode === "client" || activeModalPhase === "approval") && (
                <div className="mt-7 border-t border-[var(--border)] pt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--foreground)]/55">
                    Approval history
                  </h3>
                  <ol className="mt-3 space-y-2">
                    {[...selectedApprovalHistory]
                      .reverse()
                      .map((entry, index) => (
                        <li
                          key={`${entry.stage}-${entry.reviewer_key}-${entry.at}-${index}`}
                          className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold">
                              {entry.reviewer_name}{" "}
                              {entry.status === "approved"
                                ? "approved"
                                : "requested changes"}
                            </p>
                            <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--foreground)]/40">
                              {entry.stage} · {formatDate(entry.at, true)}
                            </span>
                          </div>
                          {entry.note && (
                            <p className="mt-2 text-xs leading-5 text-[var(--foreground)]/60">
                              {entry.note}
                            </p>
                          )}
                        </li>
                      ))}
                  </ol>
                </div>
              )}

              {currentReviewer &&
                (mode === "client" || activeModalPhase === "approval") &&
                !selectedPost.posted_at &&
                selectedPost.publishing_status !== "scheduled" &&
                (mode !== "internal" ||
                  selectedPost.production_status !== "changes_required") &&
                (mode === "internal"
                  ? Boolean(selectedPost.internal_review_submitted_at)
                  : Boolean(selectedPost.sent_to_client_at)) && (
                <div className="mt-5 border-t border-[var(--border)] pt-5">
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      disabled={
                        isSaving ||
                        reviewFor(selectedPost, mode, currentReviewer.key)
                          .status === "approved"
                      }
                      onClick={() =>
                        void recordDecision(selectedPost, "approved")
                      }
                      className="rounded-full bg-[var(--foreground)] px-5 py-2.5 text-sm font-semibold text-[var(--background)] disabled:opacity-40"
                    >
                      Approve as {currentReviewer.name}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setIsRequestingChanges((current) => !current)
                      }
                      className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-semibold"
                    >
                      Request changes
                    </button>
                  </div>
                  {isRequestingChanges && (
                    <div className="mt-4 rounded-xl border border-[#B16954]/20 bg-[#FAF5F2] p-4">
                      <label className="text-xs font-semibold text-[#694A41]">
                        What must be changed?
                        <textarea
                          autoFocus
                          rows={4}
                          value={commentDraft}
                          onChange={(event) =>
                            setCommentDraft(event.target.value)
                          }
                          className="mt-3 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-sm"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={!commentDraft.trim() || isSaving}
                        onClick={() =>
                          void recordDecision(selectedPost, "changes")
                        }
                        className="mt-3 rounded-full bg-[#A76350] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        Submit change request
                      </button>
                    </div>
                  )}
                </div>
              )}

              {mode === "internal" &&
                canSendToClient &&
                activeModalPhase === "approval" && (
                  <div className="mt-6 border-t border-[var(--border)] pt-5">
                    {selectedPost.sent_to_client_at ? (
                      <p className="rounded-full bg-[var(--muted)] px-4 py-3 text-center text-xs font-semibold text-[var(--foreground)]/70">
                        Sent by {selectedPost.sent_to_client_by ?? "the team"}{" "}
                        on {formatDate(selectedPost.sent_to_client_at, true)}
                      </p>
                    ) : (
                      <p className="text-center text-[11px] leading-5 text-[var(--foreground)]/45">
                        {isReadyForClient(selectedPost, requiredReviewers)
                          ? "Ready — this post will go out with the rest of its month when you use “Send [month] to client” on the calendar."
                          : "Add the planned date, confirm the final content, and get Karen’s approval so this post is included in the client send."}
                      </p>
                    )}
                    {selectedPost.sent_to_client_at &&
                    hasClientChangesRequested(selectedPost) ? (
                      <div className="mt-4 rounded-2xl border border-[#DDB7AB] bg-[#F8ECE8] p-4 text-center">
                        <p className="text-xs font-semibold text-[#875344]">
                          The client requested changes. Update the post, complete
                          the review step, then resend it for a fresh decision.
                        </p>
                        <button
                          type="button"
                          disabled={
                            !currentReviewer ||
                            isSending ||
                            selectedPost.production_status !== "complete" ||
                            deriveInternalApprovalState(
                              selectedPost.internal_approvals,
                              INTERNAL_REVIEWER_KEYS,
                              selectedPost.internal_review_submitted_at,
                            ) !== "approved"
                          }
                          onClick={() => void resendPostToClient(selectedPost)}
                          className="mt-3 rounded-full bg-[#A76350] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#925542] disabled:cursor-wait disabled:opacity-50"
                        >
                          {isSending ? "Resending…" : "Resend to client"}
                        </button>
                      </div>
                    ) : hasCompletedClientApproval(selectedPost) ? (
                      <p className="mt-4 rounded-xl bg-[#EAF5ED] px-4 py-3 text-center text-xs font-semibold text-[#267149]">
                        Client approved. Continue to Scheduling.
                      </p>
                    ) : selectedPost.sent_to_client_at ? (
                      <p className="mt-4 text-center text-xs leading-5 text-[var(--foreground)]/50">
                        Waiting for all required client approvals.
                      </p>
                    ) : null}
                  </div>
                )}

              {mode === "internal" &&
                canSendToClient &&
                  activeModalPhase === "scheduling" && (
                  <div className="mt-6 border-t border-[var(--border)] pt-5">
                    {contentDraft?.schedulingMode === "automatic" ? null : selectedPost.publishing_status ===
                      "scheduled" ? (
                      <div className="rounded-2xl border border-[#A9CDD5] bg-[#E8F4F7] p-4 text-center">
                        <p className="text-sm font-semibold text-[#2F6470]">
                          {selectedPost.scheduling_mode === "manual"
                            ? "Manual Slack reminder scheduled"
                            : "Queued for automatic publishing"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#2F6470]/75">
                          {selectedPost.scheduling_mode === "manual"
                            ? `Slack will send the post owner all creative at ${formatDate(selectedPost.scheduled_at, true)}.`
                            : "This post is waiting to auto-publish from Meta or the selected publishing platform."}
                        </p>
                        <button
                          type="button"
                          disabled={!currentReviewer || isSaving}
                          onClick={() =>
                            void setScheduledState(selectedPost, false)
                          }
                          className="mt-4 rounded-full border border-[#6FA1AC] bg-white px-4 py-2 text-xs font-semibold text-[#2F6470] disabled:opacity-40"
                        >
                          Change scheduling details
                        </button>
                      </div>
                    ) : hasCompletedClientApproval(selectedPost) ? (
                      <button
                        type="button"
                        disabled={
                          !currentReviewer || !scheduleDraft || isSaving
                        }
                        onClick={() =>
                          void setScheduledState(selectedPost, true)
                        }
                        className="w-full rounded-full bg-[#2F6470] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#285660] disabled:opacity-40"
                      >
                        {isSaving
                          ? "Saving…"
                          : "Schedule Slack reminder"}
                      </button>
                    ) : (
                      <p className="text-center text-xs leading-5 text-[var(--foreground)]/50">
                        Complete client approval before scheduling this post.
                      </p>
                    )}
                  </div>
                )}

              {mode === "internal" &&
                canSendToClient &&
                activeModalPhase === "publishing" && (
                  <div className="mt-6 border-t border-[var(--border)] pt-5">
                    {selectedPost.posted_at ? (
                      <div className="rounded-2xl border border-[#A8CFB5] bg-[#EAF5ED] p-4 text-center">
                        <p className="text-xs font-semibold text-[#267149]">
                          Archived as posted by {selectedPost.posted_by ?? "the team"}{" "}
                          on {formatDate(selectedPost.posted_at, true)}
                        </p>
                        <button
                          type="button"
                          disabled={!currentReviewer || isSaving}
                          onClick={() =>
                            void setPostedState(selectedPost, false)
                          }
                          className="mt-3 rounded-full border border-[#76A98A] bg-white px-4 py-2 text-xs font-semibold text-[#267149] transition hover:bg-[#F6FBF8] disabled:opacity-40"
                        >
                          {isSaving ? "Restoring…" : "Restore to scheduled"}
                        </button>
                      </div>
                    ) : selectedPost.publishing_status === "scheduled" ||
                      Boolean(contentDraft?.livePostUrl.trim()) ? (
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-4 text-center">
                        <p className="text-sm font-semibold">
                          {selectedPost.scheduling_mode === "manual"
                            ? "Waiting for manual posting"
                            : "Waiting for automatic publishing"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[var(--foreground)]/55">
                          {contentDraft?.livePostUrl.trim()
                            ? "The live URL is ready. Mark this post as posted."
                            : "Add the live URL above after it goes live, then mark it as posted."}
                        </p>
                        <button
                          type="button"
                          disabled={!currentReviewer || isSaving}
                          onClick={() => void setPostedState(selectedPost, true)}
                          className="mt-4 rounded-full bg-[#2F8A57] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                        >
                          {isSaving ? "Archiving…" : "Mark as posted"}
                        </button>
                      </div>
                    ) : (
                      <p className="text-center text-xs leading-5 text-[var(--foreground)]/50">
                        Complete the Scheduling stage first.
                      </p>
                    )}
                  </div>
                )}
            </div>
          </section>
        </div>
      )}

      {postToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--foreground)]/60 px-4 py-8 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Cancel card deletion"
            className="absolute inset-0 cursor-default"
            onClick={() => {
              if (!isDeleting) setPostToDelete(null);
            }}
          />
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-card-title"
            aria-describedby="delete-card-description"
            className="relative z-10 w-full max-w-md rounded-[24px] border border-white/70 bg-[var(--card)] p-6 shadow-2xl"
          >
            <span className="flex size-11 items-center justify-center rounded-2xl bg-[#FFF0F0] text-xl font-semibold text-[#9A4040]">
              !
            </span>
            <h2
              id="delete-card-title"
              className={`${fraunces.className} mt-5 text-2xl font-medium`}
            >
              Delete this card?
            </h2>
            <p
              id="delete-card-description"
              className="mt-2 text-sm leading-6 text-[var(--foreground)]/60"
            >
              This will permanently delete “{postToDelete.title}” and its
              slide data. This action cannot be undone.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setPostToDelete(null)}
                className="rounded-full border border-[var(--border)] px-4 py-2.5 text-xs font-semibold transition hover:bg-[var(--muted)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void deletePost()}
                className="rounded-full border border-[#D59494] bg-[#FFF0F0] px-4 py-2.5 text-xs font-semibold text-[#9A4040] transition hover:bg-[#FBE1E1] disabled:opacity-50"
              >
                {isDeleting ? "Deleting…" : "Delete card"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
