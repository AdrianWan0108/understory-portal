"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DIVISION_LABELS,
  DIVISIONS,
  type Division,
} from "@/lib/division-tasks";
import { extractGoogleDriveFileId } from "@/lib/google-drive";
import { supabase } from "@/lib/supabase";
import {
  CLIENT_IDENTITIES,
  useClientIdentity,
} from "../_components/ClientIdentity";

type ReviewDecision = {
  status: "approved" | "changes";
  reviewed_at?: string;
};

type PortalDivisionItem = {
  id: string;
  title: string;
  visual_url: string | null;
  visual_urls: string[];
  sent_to_client_at: string;
  client_approvals: unknown;
  division_tasks: {
    division: Division;
  };
};

type SocialPost = {
  id: string;
  title: string;
  sent_to_client_at: string;
  client_approvals: unknown;
  task_slides: Array<{
    slide_number: number;
    image_url: string | null;
  }> | null;
};

type ProgressUpdate = {
  id: string;
  title: string;
  status: string;
  dateLabel: string;
  timestamp: string;
  thumbnailSrc?: string;
};

type DivisionProgress = {
  division: Division;
  summary: string;
  badge: string;
  updates: ProgressUpdate[];
};

const divisionStyles: Record<Division, string> = {
  "social-media": "border-[#E2C75E] bg-[#FFF8D6]",
  website: "border-[#A9CCDF] bg-[#EEF8FC]",
  ads: "border-[#E2BCA9] bg-[#FFF1E9]",
  branding: "border-[#CDBAD9] bg-[#F5EDFA]",
  event: "border-[#AFCFC4] bg-[#EEF8F3]",
};

function previewUrl(value: string | null | undefined) {
  if (!value) return undefined;
  const driveFileId = extractGoogleDriveFileId(value);
  return driveFileId
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(
        driveFileId,
      )}&sz=w320`
    : value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function reviewsFrom(value: unknown): Record<string, ReviewDecision> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      if (record.status !== "approved" && record.status !== "changes") {
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
          },
        ],
      ];
    }),
  );
}

function latestReviewDate(value: unknown) {
  return Object.values(reviewsFrom(value))
    .map((review) => review.reviewed_at)
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => b.localeCompare(a))[0];
}

function hasRequestedChanges(value: unknown) {
  return Object.values(reviewsFrom(value)).some(
    (review) => review.status === "changes",
  );
}

function hasAllRequiredApprovals(value: unknown, reviewerKeys: string[]) {
  if (reviewerKeys.length === 0) return false;
  const reviews = reviewsFrom(value);
  return reviewerKeys.every((key) => reviews[key]?.status === "approved");
}

function DivisionIcon({ division }: { division: Division }) {
  const paths: Record<Division, React.ReactNode> = {
    "social-media": (
      <>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <path d="M17.5 6.5h.01" />
      </>
    ),
    website: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
      </>
    ),
    ads: (
      <>
        <path d="m4 13 12-5v10L4 13Z" />
        <path d="M16 10h2a3 3 0 0 1 0 6h-2M6 14l1 6h4l-2-7" />
      </>
    ),
    branding: (
      <>
        <path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h3.5A5.5 5.5 0 0 0 21 7.5C21 5 17 3 12 3Z" />
        <circle cx="8" cy="9" r="1" fill="currentColor" stroke="none" />
        <circle cx="11" cy="6.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="7" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    event: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18" />
        <path d="m9 16 2 2 4-5" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className="size-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[division]}
    </svg>
  );
}

function UpdateVisual({ update, division }: { update: ProgressUpdate; division: Division }) {
  const [hasFailed, setHasFailed] = useState(false);

  return (
    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/5 bg-white/75 text-primary">
      {update.thumbnailSrc && !hasFailed ? (
        <img
          src={update.thumbnailSrc}
          alt=""
          className="size-full object-cover"
          onError={() => setHasFailed(true)}
        />
      ) : (
        <DivisionIcon division={division} />
      )}
    </div>
  );
}

function ProgressSection({ progress }: { progress: DivisionProgress }) {
  const isSocial = progress.division === "social-media";

  return (
    <article
      className={`overflow-hidden rounded-[26px] border ${divisionStyles[progress.division]}`}
    >
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/75 text-primary shadow-sm">
              <DivisionIcon division={progress.division} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
                Project category
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-foreground">
                {DIVISION_LABELS[progress.division]}
              </h2>
              <p className="mt-2 text-sm leading-6 text-foreground/75">
                {progress.summary}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 self-end sm:self-start">
            <span className="rounded-full bg-white/80 px-3 py-1.5 text-[10px] font-semibold text-foreground/70">
              {progress.badge}
            </span>
            {isSocial && (
              <Link
                href="/client-portal/projects/social-media"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                Open calendar <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {progress.updates.length > 0 && (
        <div className="border-t border-black/10 bg-white/40 p-4 sm:p-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {progress.updates.length === 5
              ? "5 most recent updates"
              : `${progress.updates.length} recent ${
                  progress.updates.length === 1 ? "update" : "updates"
                }`}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {progress.updates.map((update) => (
              <div
                key={update.id}
                className="flex min-w-0 items-center gap-3 rounded-2xl border border-black/5 bg-white/80 p-3"
              >
                <UpdateVisual update={update} division={progress.division} />
                <div className="min-w-0">
                  <p className="line-clamp-2 text-xs font-semibold leading-4 text-foreground">
                    {update.title}
                  </p>
                  <p className="mt-1 text-[10px] font-medium leading-4 text-foreground/60">
                    {update.status}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                    {update.dateLabel}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export default function ProjectsPage() {
  const { clientSlug, clientName } = useClientIdentity();
  const [divisionItems, setDivisionItems] = useState<PortalDivisionItem[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadProgress() {
      setIsLoading(true);
      setDivisionItems([]);
      setSocialPosts([]);
      setErrorMessage(null);

      if (!clientSlug) {
        setErrorMessage("Choose a client profile to view projects.");
        setIsLoading(false);
        return;
      }

      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .eq("slug", clientSlug)
        .single();

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

      const [divisionResult, socialResult] = await Promise.all([
        supabase
          .from("division_task_items")
          .select(
            `
              id,
              title,
              visual_url,
              visual_urls,
              sent_to_client_at,
              client_approvals,
              division_tasks!inner (
                division,
                client_id
              )
            `,
          )
          .eq("division_tasks.client_id", client.id)
          .not("sent_to_client_at", "is", null)
          .order("sent_to_client_at", { ascending: false }),
        supabase
          .from("tasks")
          .select(
            `
              id,
              title,
              sent_to_client_at,
              client_approvals,
              task_slides (
                slide_number,
                image_url
              )
            `,
          )
          .eq("client_id", client.id)
          .not("sent_to_client_at", "is", null)
          .order("sent_to_client_at", { ascending: false }),
      ]);

      if (!isActive) return;
      const loadError = divisionResult.error ?? socialResult.error;
      if (loadError) {
        setErrorMessage(`Could not load portal activity: ${loadError.message}`);
        setIsLoading(false);
        return;
      }

      setDivisionItems(
        (divisionResult.data ?? []) as unknown as PortalDivisionItem[],
      );
      setSocialPosts((socialResult.data ?? []) as unknown as SocialPost[]);
      setIsLoading(false);
    }

    void loadProgress();
    return () => {
      isActive = false;
    };
  }, [clientName, clientSlug]);

  const progressByDivision = useMemo(() => {
    const reviewerKeys = Object.values(CLIENT_IDENTITIES)
      .filter((identity) => identity.clientSlug === clientSlug)
      .map((identity) => identity.username);

    function updateStatus(approvals: unknown) {
      const reviewDate = latestReviewDate(approvals);
      const hasChanges = hasRequestedChanges(approvals);
      const isApproved = hasAllRequiredApprovals(approvals, reviewerKeys);

      if (hasChanges) {
        return {
          status: "You requested changes",
          datePrefix: "Requested",
          reviewDate,
          isWaiting: false,
        };
      }
      if (isApproved) {
        return {
          status: "You approved",
          datePrefix: "Approved",
          reviewDate,
          isWaiting: false,
        };
      }
      return {
        status: "Sent for your review",
        datePrefix: "Sent",
        reviewDate,
        isWaiting: true,
      };
    }

    function divisionSummary(
      updates: ProgressUpdate[],
      waitingCount: number,
    ) {
      if (updates.length === 0) {
        return {
          summary: "No recent client portal updates.",
          badge: "No recent updates",
        };
      }
      if (waitingCount > 0) {
        return {
          summary: `${waitingCount} ${waitingCount === 1 ? "item is" : "items are"} waiting for your review.`,
          badge: `${waitingCount} to review`,
        };
      }
      return {
        summary: "You’re up to date. Your most recent portal activity is shown below.",
        badge: "Up to date",
      };
    }

    return DIVISIONS.map((division): DivisionProgress => {
      if (division === "social-media") {
        let waitingCount = 0;
        const updates = socialPosts
          .map((post): ProgressUpdate => {
            const details = updateStatus(post.client_approvals);
            if (details.isWaiting) waitingCount += 1;
            const timestamp = details.reviewDate ?? post.sent_to_client_at;
            const firstSlide = [...(post.task_slides ?? [])].sort(
              (a, b) => a.slide_number - b.slide_number,
            )[0];

            return {
              id: `social-${post.id}`,
              title: post.title,
              status: details.status,
              timestamp,
              dateLabel: `${details.datePrefix} ${formatDate(timestamp)}`,
              thumbnailSrc: previewUrl(firstSlide?.image_url),
            };
          })
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          .slice(0, 5);
        const copy = divisionSummary(updates, waitingCount);

        return {
          division,
          ...copy,
          updates,
        };
      }

      let waitingCount = 0;
      const updates = divisionItems
        .filter((item) => item.division_tasks.division === division)
        .map((item): ProgressUpdate => {
          const details = updateStatus(item.client_approvals);
          if (details.isWaiting) waitingCount += 1;
          const timestamp = details.reviewDate ?? item.sent_to_client_at;

          return {
            id: `item-${item.id}`,
            title: item.title,
            status: details.status,
            timestamp,
            dateLabel: `${details.datePrefix} ${formatDate(timestamp)}`,
            thumbnailSrc: previewUrl(
              item.visual_urls?.[0] ?? item.visual_url,
            ),
          };
        })
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 5);
      const copy = divisionSummary(updates, waitingCount);

      return {
        division,
        ...copy,
        updates,
      };
    });
  }, [clientSlug, divisionItems, socialPosts]);

  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-[1500px]">
        <header>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            Client portal · {clientName ?? "Client"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
            Projects
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Recent items shared with you and decisions made in your client
            portal.
          </p>
        </header>

        {errorMessage && (
          <div
            role="alert"
            className="mt-7 rounded-2xl border border-[#DDB7AB] bg-[#F8ECE8] px-4 py-3 text-sm leading-6 text-[#875344]"
          >
            {errorMessage}
          </div>
        )}

        <section className="mt-10" aria-labelledby="project-progress-heading">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
              Portal activity
            </p>
            <h2
              id="project-progress-heading"
              className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground"
            >
              Project categories
            </h2>
          </div>

          <div className="mt-5 grid gap-5">
            {isLoading
              ? DIVISIONS.map((division) => (
                  <div
                    key={division}
                    className="h-56 animate-pulse rounded-[26px] border border-border bg-card"
                  />
                ))
              : progressByDivision.map((progress) => (
                  <ProgressSection
                    key={progress.division}
                    progress={progress}
                  />
                ))}
          </div>
        </section>
      </div>
    </main>
  );
}
