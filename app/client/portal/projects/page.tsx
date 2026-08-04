"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DIVISION_LABELS,
  DIVISIONS,
  type Division,
  type DivisionTaskStatus,
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

type DivisionTaskItem = {
  id: string;
  title: string;
  visual_url: string | null;
  sent_to_client_at: string | null;
  client_approvals: unknown;
  created_at: string;
  updated_at: string;
};

type DivisionTask = {
  id: string;
  division: Division;
  title: string;
  status: DivisionTaskStatus;
  template_type: string;
  created_at: string;
  division_task_items: DivisionTaskItem[] | null;
};

type SocialPost = {
  id: string;
  title: string;
  status: string;
  scheduled_at: string | null;
  posted_at: string | null;
  sent_to_client_at: string | null;
  created_at: string;
  client_approvals: unknown;
  task_slides: Array<{
    slide_number: number;
    image_url: string | null;
  }> | null;
};

type WebsiteTask = {
  id: string;
  title: string;
  column_status: string;
  live_url: string | null;
  created_at: string;
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
  openCount: number;
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

const projectStatusLabels: Record<DivisionTaskStatus, string> = {
  planning: "in planning",
  production: "in production",
  review: "in review",
  approved: "approved",
};

const websiteStatusLabels: Record<string, string> = {
  needs_content: "Needs content",
  ux_design: "UX design",
  ui_design: "UI design",
  in_progress: "In progress",
  qa_testing: "QA testing",
  review: "Needs review",
  done: "Live",
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
  const [divisionTasks, setDivisionTasks] = useState<DivisionTask[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]);
  const [websiteTasks, setWebsiteTasks] = useState<WebsiteTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadProgress() {
      setIsLoading(true);
      setDivisionTasks([]);
      setSocialPosts([]);
      setWebsiteTasks([]);
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

      const [divisionResult, socialResult, websiteResult] = await Promise.all([
        supabase
          .from("division_tasks")
          .select(
            `
              id,
              division,
              title,
              status,
              template_type,
              created_at,
              division_task_items (
                id,
                title,
                visual_url,
                sent_to_client_at,
                client_approvals,
                created_at,
                updated_at
              )
            `,
          )
          .eq("client_id", client.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("tasks")
          .select(
            `
              id,
              title,
              status,
              scheduled_at,
              posted_at,
              sent_to_client_at,
              created_at,
              client_approvals,
              task_slides (
                slide_number,
                image_url
              )
            `,
          )
          .eq("client_id", client.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("website_tasks")
          .select("id, title, column_status, live_url, created_at")
          .eq("client_id", client.id)
          .order("created_at", { ascending: false }),
      ]);

      if (!isActive) return;
      const loadError =
        divisionResult.error ?? socialResult.error ?? websiteResult.error;
      if (loadError) {
        setErrorMessage(`Could not load project progress: ${loadError.message}`);
        setIsLoading(false);
        return;
      }

      setDivisionTasks(
        (divisionResult.data ?? []) as unknown as DivisionTask[],
      );
      setSocialPosts((socialResult.data ?? []) as unknown as SocialPost[]);
      setWebsiteTasks((websiteResult.data ?? []) as WebsiteTask[]);
      setIsLoading(false);
    }

    void loadProgress();
    return () => {
      isActive = false;
    };
  }, [clientName, clientSlug]);

  const progressByDivision = useMemo(() => {
    const now = new Date();
    const monthName = new Intl.DateTimeFormat("en-CA", {
      month: "long",
    }).format(now);
    const reviewerKeys = Object.values(CLIENT_IDENTITIES)
      .filter((identity) => identity.clientSlug === clientSlug)
      .map((identity) => identity.username);

    const socialUpdates = socialPosts
      .map((post): ProgressUpdate => {
        const reviewDate = latestReviewDate(post.client_approvals);
        const hasChanges = hasRequestedChanges(post.client_approvals);
        const isClientApproved = hasAllRequiredApprovals(
          post.client_approvals,
          reviewerKeys,
        );
        const timestamp =
          post.posted_at ??
          reviewDate ??
          post.sent_to_client_at ??
          post.created_at;
        const firstSlide = [...(post.task_slides ?? [])].sort(
          (a, b) => a.slide_number - b.slide_number,
        )[0];

        let status = "Planning";
        let datePrefix = "Updated";
        if (post.posted_at) {
          status = "Published";
          datePrefix = "Published";
        } else if (hasChanges) {
          status = "Client requested changes";
          datePrefix = "Reviewed";
        } else if (isClientApproved) {
          status = "Client approved";
          datePrefix = "Approved";
        } else if (post.sent_to_client_at) {
          status = "Waiting for client approval";
          datePrefix = "Sent";
        } else if (post.status === "for_review") {
          status = "In internal review";
        } else if (post.status === "needs_revision") {
          status = "Changes in progress";
        }

        return {
          id: `social-${post.id}`,
          title: post.title,
          status,
          timestamp,
          dateLabel: `${datePrefix} ${formatDate(timestamp)}`,
          thumbnailSrc: previewUrl(firstSlide?.image_url),
        };
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 5);

    const monthPosts = socialPosts.filter((post) => {
      if (!post.scheduled_at) return false;
      const date = new Date(post.scheduled_at);
      return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth()
      );
    });
    const readyMonthPosts = monthPosts.filter(
      (post) =>
        Boolean(post.posted_at) ||
        (post.status === "approved" &&
          hasAllRequiredApprovals(post.client_approvals, reviewerKeys)),
    );
    const unfinishedSocialPosts = socialPosts.filter(
      (post) =>
        !post.posted_at &&
        (post.status !== "approved" ||
          hasRequestedChanges(post.client_approvals) ||
          !hasAllRequiredApprovals(post.client_approvals, reviewerKeys)),
    );

    let socialSummary = "No Open Projects";
    let socialOpenCount = unfinishedSocialPosts.length;
    let socialBadge =
      socialOpenCount > 0 ? `${socialOpenCount} in progress` : "No open projects";
    if (monthPosts.length > 0) {
      socialOpenCount = monthPosts.length - readyMonthPosts.length;
      if (socialOpenCount === 0) {
        socialSummary = `All ${monthPosts.length} ${monthName} posts are approved and ready for the month.`;
        socialBadge = `${monthName} ready`;
      } else {
        socialSummary = `${readyMonthPosts.length} of ${monthPosts.length} ${monthName} posts are approved and ready. ${socialOpenCount} still need attention.`;
        socialBadge = `${socialOpenCount} in progress`;
      }
    } else if (unfinishedSocialPosts.length > 0) {
      socialSummary = `${unfinishedSocialPosts.length} social media ${
        unfinishedSocialPosts.length === 1 ? "post is" : "posts are"
      } currently in progress.`;
    }

    const socialProgress: DivisionProgress = {
      division: "social-media",
      summary: socialSummary,
      openCount: socialOpenCount,
      badge: socialBadge,
      updates: socialUpdates,
    };

    const otherProgress = DIVISIONS.filter(
      (division) => division !== "social-media",
    ).map((division): DivisionProgress => {
      const projects = divisionTasks.filter(
        (task) => task.division === division,
      );
      const openProjects = projects.filter(
        (task) => task.status !== "approved",
      );

      const itemUpdates = projects.flatMap((project) =>
        (project.division_task_items ?? []).map((item): ProgressUpdate => {
          const reviewDate = latestReviewDate(item.client_approvals);
          const hasChanges = hasRequestedChanges(item.client_approvals);
          const isClientApproved = hasAllRequiredApprovals(
            item.client_approvals,
            reviewerKeys,
          );
          const timestamp =
            reviewDate ?? item.sent_to_client_at ?? item.updated_at ?? item.created_at;
          const status = hasChanges
            ? "Client requested changes"
            : isClientApproved
              ? "Client approved"
              : item.sent_to_client_at
                ? "Waiting for client approval"
                : `Updated in ${project.title}`;

          return {
            id: `item-${item.id}`,
            title: item.title,
            status,
            timestamp,
            dateLabel: `Updated ${formatDate(timestamp)}`,
            thumbnailSrc: previewUrl(item.visual_url),
          };
        }),
      );

      const projectUpdates = projects.map(
        (project): ProgressUpdate => ({
          id: `project-${project.id}`,
          title: project.title,
          status: `Project ${projectStatusLabels[project.status]}`,
          timestamp: project.created_at,
          dateLabel: `Started ${formatDate(project.created_at)}`,
        }),
      );

      const specializedWebsiteUpdates =
        division === "website"
          ? websiteTasks.map(
              (task): ProgressUpdate => ({
                id: `website-${task.id}`,
                title: task.title,
                status: websiteStatusLabels[task.column_status] ?? "In progress",
                timestamp: task.created_at,
                dateLabel: `Updated ${formatDate(task.created_at)}`,
              }),
            )
          : [];

      const websiteOpenCount = websiteTasks.filter(
        (task) => task.column_status !== "done",
      ).length;
      const openCount =
        division === "website" && websiteTasks.length > 0
          ? websiteOpenCount
          : openProjects.length;

      let summary = "No Open Projects";
      if (division === "website" && websiteTasks.length > 0) {
        if (websiteOpenCount > 0) {
          summary = `${websiteOpenCount} website ${
            websiteOpenCount === 1 ? "task is" : "tasks are"
          } currently in progress.`;
        }
      } else if (openProjects.length === 1) {
        summary = `${openProjects[0].title} is ${projectStatusLabels[openProjects[0].status]}.`;
      } else if (openProjects.length > 1) {
        summary = `${openProjects.length} open projects. The newest, ${openProjects[0].title}, is ${projectStatusLabels[openProjects[0].status]}.`;
      }

      return {
        division,
        summary,
        openCount,
        badge:
          openCount > 0
            ? `${openCount} ${openCount === 1 ? "open project" : "open projects"}`
            : "No open projects",
        updates: [
          ...itemUpdates,
          ...specializedWebsiteUpdates,
          ...projectUpdates,
        ]
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
          .slice(0, 5),
      };
    });

    return [socialProgress, ...otherProgress];
  }, [clientSlug, divisionTasks, socialPosts, websiteTasks]);

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
            Current progress and the latest updates across every Understory
            project category.
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
              Live progress
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
