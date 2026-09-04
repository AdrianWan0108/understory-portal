"use client";

import { useEffect, useMemo, useState } from "react";
import ApprovalCard, { CategoryIcon } from "@/components/ApprovalCard";
import { extractGoogleDriveFileId } from "@/lib/google-drive";
import { sendSlackNotification } from "@/lib/slack-notifications";
import {
  isSocialPostFormat,
  normalizeReelDetails,
} from "@/lib/social-content";
import { supabase } from "@/lib/supabase";
import { TEAM_IDENTITIES } from "@/lib/team-auth";
import type {
  ApprovalCategory,
  ApprovalItem,
  ApprovalStatus,
} from "@/types/approvals";
import { categoryConfig } from "@/types/approvals";
import {
  CLIENT_IDENTITIES,
  useClientIdentity,
} from "../_components/ClientIdentity";

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
  status: "approved" | "changes";
  at: string;
  note?: string;
};

type SocialApprovalRow = {
  id: string;
  client_id: string;
  division_task_id: string | null;
  title: string;
  format: string | null;
  post_caption: string;
  creative_drive_link: string | null;
  reel_details: unknown;
  scheduled_at: string | null;
  sent_to_client_at: string;
  client_approvals: unknown;
  approval_history: unknown;
  assigned_to: string | null;
  assignee_usernames: string[] | null;
  task_slides: Array<{
    slide_number: number;
    image_url: string | null;
    slide_caption: string | null;
  }> | null;
};

type EventApprovalRow = {
  id: string;
  division_task_id: string;
  title: string;
  description: string | null;
  visual_url: string | null;
  visual_urls: string[];
  sent_to_client_at: string;
  client_approvals: unknown;
  approval_history: unknown;
  assignee_usernames: string[];
  division_tasks:
    | { division: "event" | "branding" }
    | Array<{ division: "event" | "branding" }>;
};

type LoadedApproval = {
  item: ApprovalItem;
  source: "social" | "event";
  clientId: string;
  divisionTaskId?: string;
  reviews: Record<string, ReviewDecision>;
  history: ApprovalHistoryEntry[];
  assigneeNames: string[];
};

function isReviewStatus(value: unknown): value is ReviewStatus {
  return value === "approved" || value === "pending" || value === "changes";
}

function normalizeReviews(value: unknown): Record<string, ReviewDecision> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

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

function approvalStatusFor(
  reviews: Record<string, ReviewDecision>,
  reviewerKey: string,
): ApprovalStatus {
  const status = reviews[reviewerKey]?.status ?? "pending";
  if (status === "approved") return "approved";
  if (status === "changes") return "changes_requested";
  return "awaiting_review";
}

function previewUrl(value: string | null | undefined) {
  if (!value) return undefined;
  const driveFileId = extractGoogleDriveFileId(value);
  if (driveFileId) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(
      driveFileId,
    )}&sz=w640`;
  }
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (hostname === "drive.google.com" || hostname === "docs.google.com") {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return value;
}

function assigneeNames(
  assigneeUsernames: string[] | null,
  legacyAssignedTo: string | null = null,
) {
  const usernames =
    assigneeUsernames && assigneeUsernames.length > 0
      ? assigneeUsernames
      : legacyAssignedTo
        ? [legacyAssignedTo]
        : [];

  return usernames.map((username) => {
    const profile = Object.values(TEAM_IDENTITIES).find(
      (candidate) => candidate.username === username,
    );
    return profile?.name ?? username;
  });
}

export default function ApprovalsPage() {
  const { identity, clientSlug, clientName } = useClientIdentity();
  const reviewer = identity ? CLIENT_IDENTITIES[identity] : null;
  const [approvals, setApprovals] = useState<LoadedApproval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadApprovals() {
      setIsLoading(true);
      setApprovals([]);
      setErrorMessage(null);
      setFeedbackMessage(null);

      if (!clientSlug || !reviewer) {
        setErrorMessage("Choose a client profile to view approvals.");
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
        setErrorMessage(
          `Could not load ${clientName ?? "the selected client"}: ${
            clientError?.message ?? "Client not found."
          }`,
        );
        setIsLoading(false);
        return;
      }

      const [socialResult, eventResult] = await Promise.all([
        supabase
          .from("tasks")
          .select(
          `
            id,
            client_id,
            division_task_id,
            title,
            format,
            post_caption,
            creative_drive_link,
            reel_details,
            scheduled_at,
            publishing_status,
            sent_to_client_at,
            client_approvals,
            approval_history,
            assigned_to,
            assignee_usernames,
            task_slides (
              slide_number,
              image_url,
              slide_caption
            )
          `,
          )
          .eq("client_id", client.id)
          .not("sent_to_client_at", "is", null)
          .is("posted_at", null)
          .neq("publishing_status", "scheduled")
          .order("sent_to_client_at", { ascending: false }),
        supabase
          .from("division_task_items")
          .select(
            `
              id,
              division_task_id,
              title,
              description,
              visual_url,
              visual_urls,
              sent_to_client_at,
              client_approvals,
              approval_history,
              assignee_usernames,
              division_tasks!inner (
                client_id,
                division
              )
            `,
          )
          .eq("division_tasks.client_id", client.id)
          .in("division_tasks.division", ["event", "branding"])
          .not("sent_to_client_at", "is", null)
          .order("sent_to_client_at", { ascending: false }),
      ]);

      if (!isActive) return;
      if (socialResult.error || eventResult.error) {
        setErrorMessage(
          `Could not load approvals: ${
            socialResult.error?.message ?? eventResult.error?.message
          }`,
        );
        setIsLoading(false);
        return;
      }

      const loadedSocial = ((socialResult.data ?? []) as unknown as SocialApprovalRow[]).map(
        (row): LoadedApproval => {
          const reviews = normalizeReviews(row.client_approvals);
          const slides = [...(row.task_slides ?? [])].sort(
            (a, b) => a.slide_number - b.slide_number,
          );
          const reelDetails = normalizeReelDetails(row.reel_details);
          const format = isSocialPostFormat(row.format)
            ? row.format
            : slides.length > 1
              ? "carousel"
              : "image";
          const image =
            format === "reel"
              ? slides[0]?.image_url ||
                reelDetails.videoUrl ||
                row.creative_drive_link
              : slides[0]?.image_url || row.creative_drive_link;

          return {
            source: "social",
            item: {
              id: row.id,
              category: "social_media",
              client: client.name,
              title: row.title,
              caption:
                format === "carousel" ? undefined : row.post_caption,
              thumbnailSrc: previewUrl(image),
              videoSrc:
                format === "reel" &&
                (reelDetails.videoUrl || row.creative_drive_link)
                  ? reelDetails.videoUrl || row.creative_drive_link || undefined
                  : undefined,
              creativeUrl: row.creative_drive_link ?? undefined,
              format,
              slides:
                format === "carousel"
                  ? slides.map((slide) => ({
                      number: slide.slide_number,
                      thumbnailSrc: previewUrl(slide.image_url),
                      caption: slide.slide_caption ?? undefined,
                    }))
                  : undefined,
              status: approvalStatusFor(reviews, reviewer.username),
              submittedAt: row.sent_to_client_at,
              plannedAt: row.scheduled_at ?? undefined,
            },
            clientId: client.id,
            divisionTaskId: row.division_task_id ?? undefined,
            reviews,
            history: normalizeHistory(row.approval_history),
            assigneeNames: assigneeNames(
              row.assignee_usernames,
              row.assigned_to,
            ),
          };
        },
      );

      const loadedEvents = ((eventResult.data ?? []) as unknown as EventApprovalRow[]).map(
        (row): LoadedApproval => {
          const reviews = normalizeReviews(row.client_approvals);
          const parentTask = Array.isArray(row.division_tasks)
            ? row.division_tasks[0]
            : row.division_tasks;
          const category =
            parentTask?.division === "branding" ? "branding" : "event";
          const visualUrls =
            row.visual_urls?.length > 0
              ? row.visual_urls
              : row.visual_url
                ? [row.visual_url]
                : [];
          return {
            source: "event",
            divisionTaskId: row.division_task_id,
            item: {
              id: row.id,
              category,
              client: client.name,
              title: row.title,
              caption: row.description ?? undefined,
              thumbnailSrc: previewUrl(visualUrls[0]),
              format: visualUrls.length > 1 ? "carousel" : "image",
              slides:
                visualUrls.length > 1
                  ? visualUrls.map((visualUrl, index) => ({
                      number: index + 1,
                      thumbnailSrc: previewUrl(visualUrl),
                    }))
                  : undefined,
              status: approvalStatusFor(reviews, reviewer.username),
              submittedAt: row.sent_to_client_at,
            },
            clientId: client.id,
            reviews,
            history: normalizeHistory(row.approval_history),
            assigneeNames: assigneeNames(row.assignee_usernames),
          };
        },
      );

      setApprovals([...loadedSocial, ...loadedEvents]);
      setIsLoading(false);
    }

    void loadApprovals();
    return () => {
      isActive = false;
    };
  }, [clientName, clientSlug, reviewer]);

  const pending = useMemo(
    () =>
      approvals
        .filter(({ item }) => item.status === "awaiting_review")
        .sort((a, b) => a.item.submittedAt.localeCompare(b.item.submittedAt)),
    [approvals],
  );
  const pendingByCategory = useMemo(
    () =>
      (Object.keys(categoryConfig) as ApprovalCategory[]).flatMap(
        (category) => {
          const items = pending.filter(
            ({ item }) => item.category === category,
          );
          return items.length > 0 ? [{ category, items }] : [];
        },
      ),
    [pending],
  );

  async function updateStatus(
    id: string,
    status: "approved" | "changes",
    comment?: string,
  ) {
    if (!reviewer || !clientSlug || updatingId) return;
    const approval = approvals.find(({ item }) => item.id === id);
    if (!approval) return;

    const timestamp = new Date().toISOString();
    const note = comment?.trim() || "";
    const nextReviews = {
      ...approval.reviews,
      [reviewer.username]: {
        status,
        reviewed_at: timestamp,
        reviewer_name: reviewer.name,
        ...(note ? { comment: note } : {}),
      },
    };
    const nextHistory = [
      ...approval.history,
      {
        stage: "client" as const,
        reviewer_key: reviewer.username,
        reviewer_name: reviewer.name,
        status,
        at: timestamp,
        ...(note ? { note } : {}),
      },
    ];
    const requiredClientReviewers = Object.values(CLIENT_IDENTITIES)
      .filter((profile) => profile.clientSlug === clientSlug)
      .map((profile) => profile.username);
    const hasAllClientApprovals = requiredClientReviewers.every(
      (username) => nextReviews[username]?.status === "approved",
    );
    const hasClientChanges = Object.values(nextReviews).some(
      (decision) => decision.status === "changes",
    );

    setUpdatingId(id);
    setErrorMessage(null);
    setFeedbackMessage(null);
    let updateQuery = supabase
      .from(approval.source === "social" ? "tasks" : "division_task_items")
      .update({
        client_approvals: nextReviews,
        approval_history: nextHistory,
        ...(approval.source === "social"
          ? {
              status:
                hasClientChanges
                  ? "changes_requested"
                  : status === "approved" && hasAllClientApprovals
                  ? "external_approved"
                  : "for_review",
              production_status: hasClientChanges
                ? "changes_required"
                : "complete",
            }
          : {
              status: status === "approved" ? "approved" : "production",
              completed: status === "approved",
            }),
      })
      .eq("id", id);
    updateQuery =
      approval.source === "social"
        ? updateQuery.eq("client_id", approval.clientId)
        : updateQuery.eq("division_task_id", approval.divisionTaskId!);
    const { error } = await updateQuery;
    setUpdatingId(null);

    if (error) {
      setErrorMessage(`Could not save the decision: ${error.message}`);
      return;
    }

    const itemStatus: ApprovalStatus =
      status === "approved" ? "approved" : "changes_requested";
    setApprovals((current) =>
      current.map((entry) =>
        entry.item.id === id
          ? {
              ...entry,
              item: { ...entry.item, status: itemStatus },
              reviews: nextReviews,
              history: nextHistory,
            }
          : entry,
      ),
    );
    setFeedbackMessage(
      pending.length === 1
        ? "All caught up — there’s nothing else to review."
        : status === "approved"
          ? `You approved “${approval.item.title}.”`
          : `Changes requested on “${approval.item.title}.”`,
    );
    void sendSlackNotification({
      type: "client_review",
      clientSlug,
      action: status === "approved" ? "approved" : "requested_changes",
      title: approval.item.title,
      reviewerName: reviewer.name,
      comment: note || undefined,
      assigneeNames: approval.assigneeNames,
      taskId: approval.item.id,
      calendarId: approval.divisionTaskId ?? null,
      scheduledAt: approval.item.plannedAt ?? null,
      transitionKey: `${approval.item.id}:client_${status}:${timestamp}:${reviewer.username}`,
    });
  }

  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-[1500px]">
        <header>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            Client portal · {clientName ?? "Client"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
            Approvals
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Review work that needs a decision. Approve or request changes on
            each item below.
          </p>
        </header>

        {errorMessage && (
          <p
            role="alert"
            className="mt-7 rounded-2xl border border-[#DDB7AB] bg-[#F8ECE8] px-4 py-3 text-sm leading-6 text-[#875344]"
          >
            {errorMessage}
          </p>
        )}
        {feedbackMessage && (
          <div
            role="status"
            className="fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-2xl border border-[#BFD8C7] bg-[#EAF5ED] px-4 py-3 text-sm leading-6 text-[#356346] shadow-[0_16px_45px_rgba(17,28,33,0.16)]"
          >
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#4F8A62] text-[11px] font-bold text-white">
              ✓
            </span>
            <span className="flex-1">{feedbackMessage}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setFeedbackMessage(null)}
              className="text-base leading-5 opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        )}

        <section className="mt-10" aria-labelledby="pending-approvals-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
                Review queue
              </p>
              <h2
                id="pending-approvals-heading"
                className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground"
              >
                Needs your review
              </h2>
            </div>
            {!isLoading && (
              <span className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-[11px] font-semibold text-secondary-foreground">
                {pending.length} {pending.length === 1 ? "item" : "items"}
              </span>
            )}
          </div>

          <div className="mt-5">
            {isLoading ? (
              <div className="flex gap-4 overflow-hidden rounded-[24px] border border-[#E2C75E] bg-[#FFF3B8]/55 p-4">
                {Array.from({ length: 3 }, (_, index) => (
                  <div
                    key={index}
                    className="h-[38rem] w-[18rem] shrink-0 animate-pulse rounded-[20px] border border-border bg-card"
                  />
                ))}
              </div>
            ) : pending.length > 0 ? (
              <div className="grid gap-5">
                {pendingByCategory.map(({ category, items }) => {
                  const config = categoryConfig[category];

                  return (
                    <section
                      key={category}
                      aria-labelledby={`approval-category-${category}`}
                      className={`overflow-hidden rounded-[26px] border p-4 sm:p-5 ${config.groupClassName}`}
                    >
                      <div className="mb-4 flex items-center justify-between gap-3 px-1">
                        <h3
                          id={`approval-category-${category}`}
                          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.17em] text-foreground"
                        >
                          <CategoryIcon icon={config.icon} />
                          {config.label}
                        </h3>
                        <span className="rounded-full bg-card/75 px-2.5 py-1 text-[10px] font-semibold text-foreground/70">
                          {items.length} {items.length === 1 ? "review" : "reviews"}
                        </span>
                      </div>

                      <div className="overflow-x-auto pb-2">
                        <div className="grid grid-flow-col auto-cols-[minmax(17.5rem,20rem)] items-stretch gap-4">
                          {items.map(({ item }) => (
                            <ApprovalCard
                              key={item.id}
                              item={item}
                              reviewLayout
                              isUpdating={updatingId === item.id}
                              onApprove={(itemId, comment) =>
                                updateStatus(itemId, "approved", comment)
                              }
                              onRequestChanges={(itemId, comment) =>
                                updateStatus(itemId, "changes", comment)
                              }
                            />
                          ))}
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[26px] border border-dashed border-border bg-card px-6 py-12 text-center">
                <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-[#EAF5ED] text-lg font-bold text-[#4F8A62]">
                  ✓
                </span>
                <p className="mt-4 text-base font-semibold text-foreground">
                  Nothing more to review
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  You&apos;re all caught up. New items will appear here when
                  they&apos;re ready.
                </p>
              </div>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}
