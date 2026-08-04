"use client";

import { Fraunces } from "next/font/google";
import { useEffect, useMemo, useState } from "react";
import {
  extractGoogleDriveFileId,
  resolveGoogleDriveFileUrls,
} from "@/lib/google-drive";
import { sendSlackNotification } from "@/lib/slack-notifications";
import {
  normalizeReelDetails,
  type ReelDetails,
} from "@/lib/social-content";
import { supabase } from "@/lib/supabase";
import { TEAM_IDENTITIES } from "@/lib/team-auth";

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
  slide_caption: string | null;
  image_url: string | null;
};

type ApprovalPost = {
  id: string;
  client_id: string;
  title: string;
  format: string | null;
  reel_details: ReelDetails;
  post_caption: string;
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
  task_slides: Slide[];
};

type TaskRow = Omit<
  ApprovalPost,
  | "internal_approvals"
  | "client_approvals"
  | "approval_history"
  | "reel_details"
  | "assignee_usernames"
  | "task_slides"
> & {
  internal_approvals: unknown;
  client_approvals: unknown;
  approval_history: unknown;
  reel_details: unknown;
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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CLIENT_REVIEWER_KEYS_BY_SLUG: Record<string, string[]> = {
  mvp: ["MVP_Gary", "MVP_Dorothy"],
  boardwalk: ["Boardwalk_Sarah"],
};
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
  return {
    ...row,
    internal_approvals: normalizeReviews(row.internal_approvals),
    client_approvals: normalizeReviews(row.client_approvals),
    approval_history: normalizeHistory(row.approval_history),
    reel_details: normalizeReelDetails(row.reel_details),
    assignee_usernames: row.assignee_usernames ?? [],
    task_slides: [...(row.task_slides ?? [])].sort(
      (a, b) => a.slide_number - b.slide_number,
    ),
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

function visualPreviewUrl(value: string | null | undefined) {
  if (!value) return null;
  const driveFileId = extractGoogleDriveFileId(value);
  return driveFileId
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(
        driveFileId,
      )}&sz=w1600`
    : value;
}

function postVisualPreviewUrl(post: ApprovalPost) {
  return visualPreviewUrl(
    post.format === "reel"
      ? post.reel_details.videoUrl || post.task_slides[0]?.image_url
      : post.task_slides[0]?.image_url,
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
  const [workspaceTitle, setWorkspaceTitle] = useState("Internal Approval");
  const [posts, setPosts] = useState<ApprovalPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSlide, setSelectedSlide] = useState(0);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [captionDraft, setCaptionDraft] = useState("");
  const [slideCaptionDrafts, setSlideCaptionDrafts] = useState<
    Record<string, string>
  >({});
  const [scheduleDraft, setScheduleDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [isRequestingChanges, setIsRequestingChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [draggingPostId, setDraggingPostId] = useState<string | null>(null);
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadPosts() {
      setIsLoading(true);
      setError(null);

      let clientId: string | null = null;
      let nextClientName = clientName ?? "Client";

      if (mode === "internal") {
        if (!workspaceId) {
          setError("This Internal Approval task is missing its workspace ID.");
          setIsLoading(false);
          return;
        }

        const { data: workspace, error: workspaceError } = await supabase
          .from("division_tasks")
          .select("id, client_id, title, clients(name, slug)")
          .eq("id", workspaceId)
          .eq("division", "social-media")
          .eq("template_type", "internal_approval")
          .maybeSingle();

        if (!isActive) return;
        if (workspaceError || !workspace) {
          setError(
            `Could not load Internal Approval: ${
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
        setResolvedClientSlug(clientRecord?.slug ?? null);
        setWorkspaceTitle(workspace.title);
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
            title,
            format,
            reel_details,
            post_caption,
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
            task_slides (
              id,
              slide_number,
              on_screen_text,
              slide_caption,
              image_url
            )
          `,
        )
        .eq("client_id", clientId)
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .order("internal_review_submitted_at", { ascending: true });

      query =
        mode === "internal"
          ? query.eq("internal_approval_task_id", workspaceId)
          : query.not("sent_to_client_at", "is", null);

      const { data, error: postsError } = await query;
      if (!isActive) return;

      if (postsError) {
        setError(`Could not load social approvals: ${postsError.message}`);
        setPosts([]);
      } else {
        const loaded = ((data ?? []) as unknown as TaskRow[]).map(mapPost);
        setPosts(loaded);
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
  }, [clientName, clientSlug, mode, workspaceId]);

  const selectedPost =
    posts.find((post) => post.id === selectedId) ?? null;
  const selectedReelVideoUrls =
    selectedPost?.format === "reel"
      ? resolveGoogleDriveFileUrls(selectedPost.reel_details.videoUrl)
      : null;

  function openPost(post: ApprovalPost) {
    setSelectedId(post.id);
    setCaptionDraft(post.post_caption);
    setSlideCaptionDrafts(
      Object.fromEntries(
        post.task_slides.map((slide) => [
          slide.id,
          slide.slide_caption ?? "",
        ]),
      ),
    );
    setScheduleDraft(toDateTimeInput(post.scheduled_at));
    setCommentDraft("");
    setIsRequestingChanges(false);
    setSelectedSlide(0);
    setFeedback(null);
  }

  const internalCounts = useMemo(
    () => ({
      pending: posts.filter(
        (post) =>
          !post.posted_at &&
          approvalStatusForReviewerKeys(
            post.internal_approvals,
            INTERNAL_REVIEWER_KEYS,
          ) === "pending",
      ).length,
      changes: posts.filter(
        (post) =>
          !post.posted_at &&
          approvalStatusForReviewerKeys(
            post.internal_approvals,
            INTERNAL_REVIEWER_KEYS,
          ) === "changes",
      ).length,
      approved: posts.filter(
        (post) =>
          !post.posted_at &&
          approvalStatusForReviewerKeys(
            post.internal_approvals,
            INTERNAL_REVIEWER_KEYS,
          ) === "approved",
      ).length,
    }),
    [posts],
  );
  const externalCounts = useMemo(() => {
    const reviewerKeys = resolvedClientSlug
      ? (CLIENT_REVIEWER_KEYS_BY_SLUG[resolvedClientSlug] ?? [])
      : [];
    const sentPosts = posts.filter(
      (post) => post.sent_to_client_at && !post.posted_at,
    );

    return {
      pending: sentPosts.filter(
        (post) =>
          approvalStatusForReviewerKeys(post.client_approvals, reviewerKeys) ===
          "pending",
      ).length,
      changes: sentPosts.filter(
        (post) =>
          approvalStatusForReviewerKeys(post.client_approvals, reviewerKeys) ===
          "changes",
      ).length,
      approved: sentPosts.filter(
        (post) =>
          approvalStatusForReviewerKeys(post.client_approvals, reviewerKeys) ===
          "approved",
      ).length,
    };
  }, [posts, resolvedClientSlug]);

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calendarCells = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const postsByDate = new Map<string, ApprovalPost[]>();
  posts.forEach((post) => {
    const key = toDateKey(post.scheduled_at);
    if (!key) return;
    postsByDate.set(key, [...(postsByDate.get(key) ?? []), post]);
  });

  const unscheduledPosts = posts.filter(
    (post) => !post.scheduled_at && !post.posted_at,
  );
  const scheduledPosts = posts
    .filter((post) => post.scheduled_at)
    .sort(
      (a, b) =>
        new Date(b.scheduled_at!).getTime() -
        new Date(a.scheduled_at!).getTime(),
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

  async function reschedulePost(post: ApprovalPost, dateKey: string) {
    if (mode !== "internal" || post.posted_at || isSaving) return;
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
      .update({ scheduled_at: iso })
      .eq("id", post.id);
    setIsSaving(false);

    if (saveError) {
      setError(`Could not move this post: ${saveError.message}`);
      return;
    }
    updatePost(post.id, { scheduled_at: iso });
    setFeedback(`${post.title} moved to ${formatDate(iso, true)}.`);
  }

  async function savePlanning(post: ApprovalPost) {
    if (mode !== "internal" || post.posted_at || isSaving) return;
    setIsSaving(true);
    setError(null);
    const scheduledAt = scheduleDraft
      ? new Date(scheduleDraft).toISOString()
      : null;

    if (post.format === "carousel") {
      for (const slide of post.task_slides) {
        const nextCaption = (slideCaptionDrafts[slide.id] ?? "").trim();
        if (nextCaption === (slide.slide_caption ?? "")) continue;

        const { error: slideSaveError } = await supabase
          .from("task_slides")
          .update({ slide_caption: nextCaption || null })
          .eq("id", slide.id);
        if (slideSaveError) {
          setIsSaving(false);
          setError(
            `Could not save the caption for slide ${slide.slide_number}: ${slideSaveError.message}`,
          );
          return;
        }
      }
    }

    const { error: saveError } = await supabase
      .from("tasks")
      .update({
        post_caption: captionDraft.trim(),
        scheduled_at: scheduledAt,
      })
      .eq("id", post.id);
    setIsSaving(false);

    if (saveError) {
      setError(`Could not save the final details: ${saveError.message}`);
      return;
    }
    updatePost(post.id, {
      post_caption: captionDraft.trim(),
      scheduled_at: scheduledAt,
      task_slides: post.task_slides.map((slide) => ({
        ...slide,
        slide_caption:
          post.format === "carousel"
            ? (slideCaptionDrafts[slide.id] ?? "").trim() || null
            : slide.slide_caption,
      })),
    });
    if (scheduledAt) {
      const date = new Date(scheduledAt);
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    setFeedback(
      post.format === "carousel"
        ? "Date, post caption, and individual slide captions saved."
        : "Date, time, and final caption saved.",
    );
  }

  async function toggleFinalConfirmation(post: ApprovalPost) {
    if (
      mode !== "internal" ||
      post.posted_at ||
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

  async function recordDecision(
    post: ApprovalPost,
    status: Exclude<ReviewStatus, "pending">,
  ) {
    if (!currentReviewer || isSaving) return;
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

    setIsSaving(true);
    const { error: saveError } = await supabase
      .from("tasks")
      .update({
        [reviewColumn]: nextReviews,
        approval_history: nextHistory,
        ...(mode === "internal" && status === "changes"
          ? { status: "needs_revision" }
          : {}),
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
      });
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
        status: "approved",
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
            }
          : post,
      ),
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
        status: "approved",
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
    });
    setFeedback(`${post.title} was resent to the client for a new review.`);
  }

  async function setPostedState(post: ApprovalPost, isPosted: boolean) {
    if (
      mode !== "internal" ||
      !canSendToClient ||
      !currentReviewer ||
      isSaving
    ) {
      return;
    }

    const postedAt = isPosted ? new Date().toISOString() : null;
    const postedBy = isPosted ? currentReviewer.name : null;
    setIsSaving(true);
    setError(null);
    const { error: saveError } = await supabase
      .from("tasks")
      .update({ posted_at: postedAt, posted_by: postedBy })
      .eq("id", post.id);
    setIsSaving(false);

    if (saveError) {
      setError(
        `Could not ${isPosted ? "archive" : "restore"} this post: ${saveError.message}`,
      );
      return;
    }

    updatePost(post.id, { posted_at: postedAt, posted_by: postedBy });
    setFeedback(
      isPosted
        ? `${post.title} marked as posted and archived.`
        : `${post.title} restored to the active approval workflow.`,
    );
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
                ? "Social media · Internal review"
                : "Projects · Social media"}
            </p>
            <h1
              className={`${fraunces.className} text-4xl font-medium leading-tight tracking-tight sm:text-5xl`}
            >
              {mode === "internal" ? workspaceTitle : "Social media calendar"}
            </h1>
            <p
              className={`${fraunces.className} mt-2 italic text-lg text-[var(--foreground)]/55`}
            >
              {resolvedClientName}
            </p>
          </div>
        </header>

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

        <section aria-labelledby="internal-approval-summary" className="mt-8">
          <div className="mb-3 flex items-center gap-3">
            <h2
              id="internal-approval-summary"
              className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground)]/55"
            >
              Internal approval
            </h2>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                count: internalCounts.pending,
                label: "Awaiting review",
                detail: "Waiting for the internal decision",
                color: "text-[#9A773F]",
                dot: "bg-[#9A773F]",
              },
              {
                count: internalCounts.changes,
                label: "Changes requested",
                detail: "Internal revisions are required",
                color: "text-[#A15E4C]",
                dot: "bg-[#A15E4C]",
              },
              {
                count: internalCounts.approved,
                label: "Approved",
                detail: "Approved by the internal team",
                color: "text-[var(--primary)]",
                dot: "bg-[var(--primary)]",
              },
            ].map((item) => (
              <article
                key={item.label}
                className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[0_4px_18px_rgba(49,75,62,0.025)] sm:p-6"
              >
                <div className="flex items-end justify-between gap-4">
                  <p
                    className={`${fraunces.className} text-4xl font-medium ${item.color}`}
                  >
                    {isLoading ? "—" : item.count}
                  </p>
                  <span className={`mb-2 size-2 rounded-full ${item.dot}`} />
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em]">
                  {item.label}
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--foreground)]/45">
                  {item.detail}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="external-approval-summary" className="mt-6">
          <div className="mb-3 flex items-center gap-3">
            <h2
              id="external-approval-summary"
              className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5A3584]"
            >
              External approval
            </h2>
            <span className="h-px flex-1 bg-[#D9C8E8]" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                count: externalCounts.pending,
                label: "Awaiting review",
                detail: "Client reviewing content",
                dot: "bg-[#F4C96A]",
              },
              {
                count: externalCounts.changes,
                label: "Changes requested",
                detail: "Client revisions are required",
                dot: "bg-[#F3A58E]",
              },
              {
                count: externalCounts.approved,
                label: "Approved",
                detail: "Client approval complete",
                dot: "bg-[#9ED0AE]",
              },
            ].map((item) => (
              <article
                key={item.label}
                className="rounded-2xl border border-[#5D3A86] bg-[#3F236F] p-5 text-white shadow-[0_8px_24px_rgba(63,35,111,0.16)] sm:p-6"
              >
                <div className="flex items-end justify-between gap-4">
                  <p className={`${fraunces.className} text-4xl font-medium`}>
                    {isLoading ? "—" : item.count}
                  </p>
                  <span className={`mb-2 size-2 rounded-full ${item.dot}`} />
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em]">
                  {item.label}
                </p>
                <p className="mt-1 text-xs leading-5 text-white/65">
                  {item.detail}
                </p>
              </article>
            ))}
          </div>
        </section>

        <div className="mt-10 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:items-start">
          <section aria-labelledby="approval-grid-heading" className="xl:sticky xl:top-6 xl:order-2">
            <div className="mb-4">
              <h2
                id="approval-grid-heading"
                className={`${fraunces.className} text-2xl font-medium`}
              >
                Feed preview
              </h2>
              <p className="mt-1 text-xs text-[var(--foreground)]/50">
                Scheduled posts with the newest publish date first,
                Instagram-grid style — plan how the feed will look before
                sending it out.
              </p>
            </div>
            {scheduledPosts.length === 0 ? (
              <p className="rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center text-sm text-[var(--foreground)]/45">
                Schedule a date and time for posts to see them here in feed
                order.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)] sm:gap-px">
                {scheduledPosts.map((post) => {
                  const previewUrl = postVisualPreviewUrl(post);
                  return (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => openPost(post)}
                      aria-label={`${post.title} — ${formatDate(post.scheduled_at, true)}`}
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

          <section aria-labelledby="approval-calendar-heading" className="xl:order-1">
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
                  ? "Open a post to plan its date, time, caption, and final confirmation."
                  : "Open a post to review the final creative and caption."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {mode === "internal" && canSendToClient && (
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
                        const post = posts.find((item) => item.id === postId);
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
                          const status = overallStatus(
                            post,
                            mode,
                            requiredReviewers,
                          );
                          const previewUrl = postVisualPreviewUrl(post);
                          return (
                            <button
                              key={post.id}
                              type="button"
                              draggable={mode === "internal" && !post.posted_at}
                              onClick={() => openPost(post)}
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
                                mode === "internal" && !post.posted_at
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
                                  {new Intl.DateTimeFormat("en-CA", {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  }).format(new Date(post.scheduled_at!))}
                                </span>
                                {post.posted_at ? (
                                  <span className="mt-2 flex items-center gap-1.5 text-[9px] font-semibold text-[#267149]">
                                    <span className="size-1.5 rounded-full bg-[#3A9B63]" />
                                    Archived
                                  </span>
                                ) : (
                                  <span className="mt-2 flex items-center gap-1.5 text-[9px]">
                                    <span
                                      className={`size-1.5 rounded-full ${reviewStyles[status].dot}`}
                                    />
                                    {reviewStyles[status].label}
                                  </span>
                                )}
                                {!post.posted_at &&
                                  mode === "internal" &&
                                  hasClientChangesRequested(post) && (
                                    <span className="mt-1 flex items-center gap-1.5 text-[9px] font-semibold text-[#A15E4C]">
                                      <span className="size-1.5 rounded-full bg-[#A15E4C]" />
                                      Client requested changes
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

        {mode === "internal" && unscheduledPosts.length > 0 && (
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
                  onClick={() => openPost(post)}
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

        {!isLoading && posts.length === 0 && (
          <section className="mt-8 rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center">
            <p className="text-sm font-semibold">
              {mode === "internal"
                ? "No posts have been submitted internally yet."
                : "No social media approvals yet."}
            </p>
            <p className="mt-1 text-xs text-[var(--foreground)]/45">
              {mode === "internal"
                ? "Posts appear here when the team chooses “Submit for review” in a content calendar."
                : `Posts sent for ${resolvedClientName}’s review will appear here.`}
            </p>
          </section>
        )}
      </div>

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
                      selectedPost.task_slides[selectedSlide]?.image_url,
                    )
                      ? {
                          backgroundImage: `url("${visualPreviewUrl(
                            selectedPost.task_slides[selectedSlide]?.image_url,
                          )!.replaceAll('"', "%22")}")`,
                        }
                      : undefined
                  }
                >
                  {!visualPreviewUrl(
                    selectedPost.task_slides[selectedSlide]?.image_url,
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
              {selectedPost.posted_at && (
                <PostedStamp className="absolute right-8 top-8 z-10 px-4 py-2 text-xs" />
              )}
            </div>

            <div className="p-5 sm:p-7 md:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground)]/45">
                  {formatLabel(selectedPost.format)} ·{" "}
                  {formatDate(selectedPost.scheduled_at, true)}
                </p>
                {selectedPost.posted_at ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF5ED] px-2.5 py-1 text-[10px] font-semibold text-[#267149]">
                    <span className="size-1.5 rounded-full bg-[#3A9B63]" />
                    Archived
                  </span>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                      reviewStyles[
                        overallStatus(selectedPost, mode, requiredReviewers)
                      ].pill
                    }`}
                  >
                    {
                      reviewStyles[
                        overallStatus(selectedPost, mode, requiredReviewers)
                      ].label
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
                  <label className="text-xs font-semibold">
                    Planned publishing date and time
                    <input
                      type="datetime-local"
                      disabled={Boolean(selectedPost.posted_at)}
                      value={scheduleDraft}
                      onChange={(event) => setScheduleDraft(event.target.value)}
                      className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                    />
                  </label>
                  {selectedPost.format === "carousel" &&
                    selectedPost.task_slides[selectedSlide] && (
                      <label className="rounded-2xl border border-[var(--primary)]/25 bg-[var(--muted)]/55 p-4 text-xs font-semibold">
                        Slide {selectedSlide + 1} caption
                        <textarea
                          rows={5}
                          disabled={Boolean(selectedPost.posted_at)}
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
                          className="mt-2 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm font-normal leading-6"
                          placeholder={`Write the caption for slide ${selectedSlide + 1}.`}
                        />
                        <span className="mt-2 block text-[11px] font-normal leading-5 text-[var(--foreground)]/45">
                          Select another slide on the left to give it a different
                          caption.
                        </span>
                      </label>
                    )}
                  <label className="text-xs font-semibold">
                    {selectedPost.format === "carousel"
                      ? "Post caption (shown below the whole carousel)"
                      : "Final caption"}
                    <textarea
                      rows={8}
                      disabled={Boolean(selectedPost.posted_at)}
                      value={captionDraft}
                      onChange={(event) => setCaptionDraft(event.target.value)}
                      className="mt-2 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm leading-6"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={Boolean(selectedPost.posted_at) || isSaving}
                    onClick={() => void savePlanning(selectedPost)}
                    className="w-fit rounded-full border border-[var(--border)] px-4 py-2 text-xs font-semibold hover:bg-[var(--muted)] disabled:opacity-50"
                  >
                    {isSaving ? "Saving…" : "Save final details"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      Boolean(selectedPost.posted_at) ||
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
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--foreground)]/40">
                      {selectedPost.format === "carousel"
                        ? "Post caption"
                        : "Caption"}
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--foreground)]/75">
                      {selectedPost.post_caption}
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-7">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--foreground)]/55">
                    Required approvals
                  </h3>
                  <span className="text-[10px] text-[var(--foreground)]/40">
                    {requiredReviewers.length}{" "}
                    {requiredReviewers.length === 1 ? "person" : "people"} required
                  </span>
                </div>
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

              {mode === "internal" &&
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

              {currentReviewer && !selectedPost.posted_at && (
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

              {mode === "internal" && canSendToClient && (
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
                        {isSaving ? "Restoring…" : "Restore to active"}
                      </button>
                    </div>
                  ) : (
                    <>
                      {selectedPost.sent_to_client_at ? (
                        <p className="rounded-full bg-[var(--muted)] px-4 py-3 text-center text-xs font-semibold text-[var(--foreground)]/70">
                          Sent by {selectedPost.sent_to_client_by ?? "the team"}{" "}
                          on {formatDate(selectedPost.sent_to_client_at, true)}
                        </p>
                      ) : (
                        <p className="text-center text-[11px] leading-5 text-[var(--foreground)]/45">
                          {isReadyForClient(selectedPost, requiredReviewers)
                            ? "Ready — this post will go out with the rest of its month when you use “Send [month] to client” on the calendar."
                            : "Add the date and time, confirm the final content, and get Karen’s approval so this post is included in that month’s client send."}
                        </p>
                      )}
                      {selectedPost.sent_to_client_at &&
                      hasClientChangesRequested(selectedPost) ? (
                        <div className="mt-4 rounded-2xl border border-[#DDB7AB] bg-[#F8ECE8] p-4 text-center">
                          <p className="text-xs font-semibold text-[#875344]">
                            The client requested changes. Update the post in its
                            calendar task, reload this page, then resend it for
                            a fresh decision.
                          </p>
                          <button
                            type="button"
                            disabled={!currentReviewer || isSending}
                            onClick={() =>
                              void resendPostToClient(selectedPost)
                            }
                            className="mt-3 rounded-full bg-[#A76350] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#925542] disabled:cursor-wait disabled:opacity-50"
                          >
                            {isSending ? "Resending…" : "Resend to client"}
                          </button>
                        </div>
                      ) : selectedPost.sent_to_client_at ? (
                        <button
                          type="button"
                          disabled={!currentReviewer || isSaving}
                          onClick={() =>
                            void setPostedState(selectedPost, true)
                          }
                          className="mt-4 w-full rounded-full bg-[#2F8A57] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#267149] disabled:opacity-40"
                        >
                          {isSaving ? "Archiving…" : "Mark as posted"}
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
