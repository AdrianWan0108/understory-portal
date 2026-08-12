"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GanttTask } from "frappe-gantt";
import {
  DIVISIONS,
  DIVISION_LABELS,
  DIVISION_TASK_STATUSES,
  isDivisionTaskStatus,
  type Division,
  type DivisionTaskStatus,
} from "@/lib/division-tasks";
import { supabase } from "@/lib/supabase";
import { teamNameForUsername } from "@/lib/team-assignments";
import {
  isWorkspaceClientSlug,
  type WorkspaceClientSlug,
} from "@/lib/workspace-clients";

type GanttViewMode = "Day" | "Week" | "Month";

type TeamMember = {
  team_username: string;
  full_name: string;
  avatar_url: string | null;
};

type TimelineStatus =
  | DivisionTaskStatus
  | "internal-approved"
  | "external-approved"
  | "changes-requested"
  | "posted";

type TimelineItem = {
  id: string;
  title: string;
  status: TimelineStatus;
  href: string;
  startDate: string | null;
  dueDate: string | null;
  assignees: TeamMember[];
};

type TaskGroup = {
  taskId: string;
  taskTitle: string;
  href: string;
  items: TimelineItem[];
};

type TimelineSourceTable = "tasks" | "division_task_items";

type UnderstoryGanttTask = GanttTask & {
  href: string;
  thumbnail?: string;
  sourceTable: TimelineSourceTable;
  timelineStatus: TimelineStatus;
  persistedStart: string;
  persistedEnd: string;
};

type ReviewDecision = {
  status?: unknown;
};

const socialTimelineStatuses: TimelineStatus[] = [
  "planning",
  "production",
  "review",
  "internal-approved",
  "external-approved",
  "changes-requested",
  "posted",
];

const clientReviewerKeys: Partial<Record<WorkspaceClientSlug, string[]>> = {
  mvp: ["MVP_Gary", "MVP_Dorothy"],
  boardwalk: ["Boardwalk_Sarah"],
};

const internalReviewerKeys = ["Understory_Karen"];

const timelineStatusDetails: Record<
  TimelineStatus,
  { label: string }
> = {
  planning: { label: "Not started" },
  production: { label: "In progress" },
  review: { label: "Awaiting approvals" },
  approved: { label: "Approved" },
  "internal-approved": { label: "Internal approved" },
  "external-approved": { label: "External approved" },
  "changes-requested": { label: "Changes requested" },
  posted: { label: "Posted" },
};

function taskHref(taskId: string, division: Division, clientSlug: string) {
  if (division === "website" && isWorkspaceClientSlug(clientSlug)) {
    return `/team-hub/projects/website?client=${clientSlug}&task=${encodeURIComponent(taskId)}`;
  }
  return `/team-hub/projects/${encodeURIComponent(taskId)}`;
}

function dateFromValue(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function subtractCalendarDays(value: string, days: number) {
  const date = dateFromValue(value);
  if (!date) return value;
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKeyFromTimestamp(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKeyFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function reviewStatuses(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.values(value as Record<string, ReviewDecision>).flatMap(
    (decision) =>
      decision?.status === "approved" || decision?.status === "changes"
        ? [decision.status]
        : [],
  );
}

function allReviewsApproved(value: unknown) {
  const statuses = reviewStatuses(value);
  return statuses.length > 0 && statuses.every((status) => status === "approved");
}

function requiredReviewsApproved(value: unknown, reviewerKeys: string[]) {
  if (!reviewerKeys.length) return allReviewsApproved(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const reviews = value as Record<string, ReviewDecision>;
  return reviewerKeys.every((key) => reviews[key]?.status === "approved");
}

function hasChangesRequested(value: unknown) {
  return reviewStatuses(value).includes("changes");
}

function socialItemStatus(post: {
  status: string;
  internal_approvals: unknown;
  client_approvals: unknown;
  sent_to_client_at: string | null;
  posted_at: string | null;
}, clientSlug: WorkspaceClientSlug): TimelineStatus {
  if (post.posted_at || post.status === "posted") return "posted";
  if (post.status === "not_started") return "planning";
  if (post.status === "in_progress") return "production";
  if (post.status === "for_review") return "review";
  if (post.status === "internal_approved") return "internal-approved";
  if (post.status === "external_approved") return "external-approved";
  if (post.status === "changes_requested") return "changes-requested";
  if (
    post.status === "needs_revision" ||
    hasChangesRequested(post.internal_approvals) ||
    hasChangesRequested(post.client_approvals)
  ) {
    return "changes-requested";
  }
  if (
    requiredReviewsApproved(
      post.client_approvals,
      clientReviewerKeys[clientSlug] ?? [],
    )
  ) {
    return "external-approved";
  }
  if (
    requiredReviewsApproved(post.internal_approvals, internalReviewerKeys) ||
    post.status === "approved" ||
    post.status === "done"
  ) {
    return "internal-approved";
  }
  if (
    post.sent_to_client_at ||
    post.status === "for_review" ||
    post.status === "review" ||
    post.status === "in_review"
  ) {
    return "review";
  }
  return "planning";
}

function socialDatabaseStatus(status: TimelineStatus) {
  const statuses: Record<TimelineStatus, string> = {
    planning: "not_started",
    production: "in_progress",
    review: "for_review",
    approved: "internal_approved",
    "internal-approved": "internal_approved",
    "external-approved": "external_approved",
    "changes-requested": "changes_requested",
    posted: "posted",
  };
  return statuses[status];
}

function websiteItemStatus(value: string): DivisionTaskStatus {
  if (value === "done") return "approved";
  if (value === "qa_testing" || value === "review") return "review";
  if (value === "in_progress") return "production";
  return "planning";
}

function assigneesFor(
  usernames: string[] | null,
  assignedTo: string | null,
  profiles: Map<string, TeamMember>,
) {
  const resolved = (usernames ?? []).map(
    (username): TeamMember =>
      profiles.get(username) ?? {
        team_username: username,
        full_name: teamNameForUsername(username) ?? username,
        avatar_url: null,
      },
  );
  if (resolved.length || !assignedTo) return resolved;

  const matchingProfile = Array.from(profiles.values()).find(
    (profile) =>
      profile.full_name.trim().toLocaleLowerCase() ===
      assignedTo.trim().toLocaleLowerCase(),
  );
  return [
    matchingProfile ?? {
      team_username: assignedTo,
      full_name: assignedTo,
      avatar_url: null,
    },
  ];
}

function socialCalendarHref(taskId: string) {
  const encodedId = encodeURIComponent(taskId);
  return `/team-hub/projects/${encodedId}/calendar?calendar=${encodedId}`;
}

function initialsAvatarDataUrl(name: string) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#7D4698"/><text x="16" y="20" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="white">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function keepBarContentInside(container: HTMLElement) {
  const svgNamespace = "http://www.w3.org/2000/svg";
  container
    .querySelectorAll<SVGGElement>(".bar-wrapper")
    .forEach((wrapper, index) => {
      const bar = wrapper.querySelector<SVGRectElement>(".bar");
      const barGroup = wrapper.querySelector<SVGGElement>(".bar-group");
      const label = wrapper.querySelector<SVGTextElement>(".bar-label");
      if (!bar || !barGroup || !label) return;

      const barX = Number(bar.getAttribute("x") ?? 0);
      const barY = Number(bar.getAttribute("y") ?? 0);
      const barWidth = Number(bar.getAttribute("width") ?? 0);
      const barHeight = Number(bar.getAttribute("height") ?? 0);
      const image = wrapper.querySelector<SVGImageElement>(".bar-img");
      const imageMask = wrapper.querySelector<SVGRectElement>(".img_mask");

      if (image) {
        const avatarSize = Math.min(22, Math.max(barHeight - 10, 0));
        const avatarX = barX + 7;
        const avatarY = barY + (barHeight - avatarSize) / 2;
        image.setAttribute("x", String(avatarX));
        image.setAttribute("y", String(avatarY));
        image.setAttribute("width", String(avatarSize));
        image.setAttribute("height", String(avatarSize));
        imageMask?.setAttribute("x", String(avatarX));
        imageMask?.setAttribute("y", String(avatarY));
        imageMask?.setAttribute("width", String(avatarSize));
        imageMask?.setAttribute("height", String(avatarSize));
        imageMask?.setAttribute("rx", String(avatarSize / 2));
      }

      const imageWidth = image
        ? Number(image.getAttribute("width") ?? Math.max(barHeight - 5, 0))
        : 0;
      const fullLabel = label.dataset.fullLabel ?? label.textContent ?? "";
      label.dataset.fullLabel = fullLabel;
      label.classList.remove("big");
      label.setAttribute("text-anchor", "start");
      const labelX = barX + (image ? imageWidth + 10 : 8);
      label.setAttribute("x", String(labelX));
      label.textContent = fullLabel;
      const availableWidth = Math.max(barX + barWidth - 8 - labelX, 0);
      if (label.getComputedTextLength() > availableWidth) {
        let shortened = fullLabel;
        while (
          shortened.length > 1 &&
          label.getComputedTextLength() > availableWidth
        ) {
          shortened = shortened.slice(0, -1);
          label.textContent = `${shortened.trimEnd()}…`;
        }
      }

      let title = wrapper.querySelector<SVGTitleElement>(":scope > title");
      if (!title) {
        title = document.createElementNS(svgNamespace, "title");
        wrapper.prepend(title);
      }
      title.textContent = fullLabel;

      let definitions = barGroup.querySelector<SVGDefsElement>("defs");
      if (!definitions) {
        definitions = document.createElementNS(svgNamespace, "defs");
        barGroup.prepend(definitions);
      }
      const rawId = wrapper.getAttribute("data-id") ?? String(index);
      const clipId = `understory-bar-label-${rawId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
      let clipPath = definitions.querySelector<SVGClipPathElement>(
        `#${CSS.escape(clipId)}`,
      );
      if (!clipPath) {
        clipPath = document.createElementNS(svgNamespace, "clipPath");
        clipPath.setAttribute("id", clipId);
        definitions.appendChild(clipPath);
      }
      let clipRect = clipPath.querySelector<SVGRectElement>("rect");
      if (!clipRect) {
        clipRect = document.createElementNS(svgNamespace, "rect");
        clipPath.appendChild(clipRect);
      }
      clipRect.setAttribute("x", String(barX + 4));
      clipRect.setAttribute("y", String(barY));
      clipRect.setAttribute("width", String(Math.max(barWidth - 8, 0)));
      clipRect.setAttribute("height", String(barHeight));
      label.setAttribute("clip-path", `url(#${clipId})`);
    });
}

function centerTimelineOnToday(
  scroller: HTMLElement,
  behavior: ScrollBehavior = "smooth",
) {
  const marker = scroller.querySelector<HTMLElement>(".current-highlight");
  const markerLeft = Number.parseFloat(marker?.style.left ?? "");
  if (!Number.isFinite(markerLeft)) return;
  scroller.scrollTo({
    left: Math.max(markerLeft - scroller.clientWidth * 0.45, 0),
    behavior,
  });
}

function FrappeItemChart({
  tasks,
  viewMode,
  onDateChange,
  onStatusChange,
}: {
  tasks: UnderstoryGanttTask[];
  viewMode: GanttViewMode;
  onDateChange: (
    task: UnderstoryGanttTask,
    startDate: string,
    dueDate: string,
  ) => Promise<void>;
  onStatusChange: (
    task: UnderstoryGanttTask,
    status: TimelineStatus,
  ) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const saveMessageTimerRef = useRef<number | null>(null);
  const dateSaveTimerRef = useRef<number | null>(null);
  const didEditDateRef = useRef(false);
  const scrollPositionRef = useRef({ left: 0, top: 0, hasPosition: false });
  const previousViewModeRef = useRef<GanttViewMode | null>(null);
  const [renderRevision, setRenderRevision] = useState(0);
  const [saveMessage, setSaveMessage] = useState<{
    tone: "saving" | "saved" | "error";
    text: string;
  } | null>(null);
  const [selectedTask, setSelectedTask] =
    useState<UnderstoryGanttTask | null>(null);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    scroller: HTMLElement;
  } | null>(null);
  const didPanRef = useRef(false);

  function startPanning(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    if ((event.target as Element).closest("button, a, .bar-wrapper, .handle")) {
      return;
    }
    const scroller = containerRef.current?.querySelector<HTMLElement>(
      ".gantt-container",
    );
    if (!scroller) return;
    didPanRef.current = false;
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: scroller.scrollLeft,
      scroller,
    };
    scroller.dataset.panning = "true";
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continuePanning(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const distance = event.clientX - pan.startX;
    if (Math.abs(distance) > 4) didPanRef.current = true;
    pan.scroller.scrollLeft = pan.startScrollLeft - distance;
  }

  function stopPanning(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    delete pan.scroller.dataset.panning;
    panRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => {
      didPanRef.current = false;
    }, 0);
  }

  function shiftTimeline(direction: -1 | 1) {
    const scroller = containerRef.current?.querySelector<HTMLElement>(
      ".gantt-container",
    );
    if (!scroller) return;
    scroller.scrollBy({
      left: direction * Math.max(scroller.clientWidth * 0.72, 280),
      behavior: "smooth",
    });
  }

  function jumpToToday() {
    const scroller = containerRef.current?.querySelector<HTMLElement>(
      ".gantt-container",
    );
    if (!scroller) return;
    centerTimelineOnToday(scroller);
  }

  const persistDateChange = useCallback(
    async (task: UnderstoryGanttTask, start: Date, end: Date) => {
      const nextStart = dateKeyFromDate(start);
      const nextEnd = dateKeyFromDate(end);
      const previousStart = task.persistedStart;
      const previousEnd = task.persistedEnd;

      if (saveMessageTimerRef.current) {
        window.clearTimeout(saveMessageTimerRef.current);
      }
      setSaveMessage({ tone: "saving", text: "Saving dates…" });

      try {
        await onDateChange(task, nextStart, nextEnd);
        task.start = nextStart;
        task.end = nextEnd;
        task.persistedStart = nextStart;
        task.persistedEnd = nextEnd;
        setSaveMessage({ tone: "saved", text: "Dates saved" });
        saveMessageTimerRef.current = window.setTimeout(
          () => setSaveMessage(null),
          2200,
        );
      } catch (saveError) {
        task.start = previousStart;
        task.end = previousEnd;
        setRenderRevision((current) => current + 1);
        setSaveMessage({
          tone: "error",
          text:
            saveError instanceof Error
              ? saveError.message
              : "Could not save the dates.",
        });
      }
    },
    [onDateChange],
  );

  const queueDateChange = useCallback(
    (task: UnderstoryGanttTask, start: Date, end: Date) => {
      didEditDateRef.current = true;
      if (dateSaveTimerRef.current) {
        window.clearTimeout(dateSaveTimerRef.current);
      }
      setSaveMessage({ tone: "saving", text: "Release to save dates…" });
      dateSaveTimerRef.current = window.setTimeout(() => {
        void persistDateChange(task, start, end).finally(() => {
          window.setTimeout(() => {
            didEditDateRef.current = false;
          }, 300);
        });
      }, 250);
    },
    [persistDateChange],
  );

  async function changeSelectedStatus(status: TimelineStatus) {
    if (!selectedTask || isSavingStatus) return;
    const previousStatus = selectedTask.timelineStatus;
    setIsSavingStatus(true);
    setSaveMessage({ tone: "saving", text: "Saving status…" });
    try {
      await onStatusChange(selectedTask, status);
      const nextTask = {
        ...selectedTask,
        timelineStatus: status,
        custom_class: `gantt-status-${status}`,
      };
      containerRef.current
        ?.querySelectorAll<SVGGElement>(".bar-wrapper")
        .forEach((wrapper) => {
          if (wrapper.getAttribute("data-id") !== selectedTask.id) return;
          Array.from(wrapper.classList)
            .filter((className) => className.startsWith("gantt-status-"))
            .forEach((className) => wrapper.classList.remove(className));
          wrapper.classList.add(`gantt-status-${status}`);
        });
      setSelectedTask(nextTask);
      setSaveMessage({ tone: "saved", text: "Status saved" });
      saveMessageTimerRef.current = window.setTimeout(
        () => setSaveMessage(null),
        2200,
      );
    } catch (statusError) {
      setSelectedTask((current) =>
        current ? { ...current, timelineStatus: previousStatus } : current,
      );
      setSaveMessage({
        tone: "error",
        text:
          statusError instanceof Error
            ? statusError.message
            : "Could not save the status.",
      });
    } finally {
      setIsSavingStatus(false);
    }
  }

  useEffect(() => {
    const mountedContainer = containerRef.current;
    if (!mountedContainer || tasks.length === 0) return;
    const chartContainer: HTMLDivElement = mountedContainer;
    let isActive = true;
    let labelFrame = 0;
    let labelTimer = 0;
    let positionTimer = 0;
    let observer: MutationObserver | null = null;
    let timelineScroller: HTMLElement | null = null;
    const shouldCenterTimeline = previousViewModeRef.current !== viewMode;
    previousViewModeRef.current = viewMode;

    const rememberScrollPosition = () => {
      if (!timelineScroller) return;
      scrollPositionRef.current = {
        left: timelineScroller.scrollLeft,
        top: timelineScroller.scrollTop,
        hasPosition: true,
      };
    };

    function observeChart() {
      if (!observer) return;
      observer.observe(chartContainer, {
        attributes: true,
        attributeFilter: ["x", "width"],
        childList: true,
        subtree: true,
      });
    }

    function correctChartContent() {
      observer?.disconnect();
      keepBarContentInside(chartContainer);
      observeChart();
    }

    async function renderChart() {
      const { default: Gantt } = await import("frappe-gantt");
      if (!isActive) return;
      chartContainer.replaceChildren();
      new Gantt(chartContainer, tasks, {
        view_mode: viewMode,
        readonly: false,
        readonly_dates: false,
        readonly_progress: true,
        move_dependencies: false,
        scroll_to: "today",
        today_button: false,
        view_mode_select: false,
        auto_move_label: false,
        // Frappe redraws the entire SVG while scrolling when this is enabled.
        // A finite padded range is considerably smoother and still leaves room
        // before and after the scheduled items in every supported view mode.
        infinite_padding: false,
        bar_corner_radius: 8,
        bar_height: 36,
        padding: 14,
        popup: false,
        on_date_change: (task, start, end) => {
          queueDateChange(task as UnderstoryGanttTask, start, end);
        },
        on_click: (task) => {
          if (didPanRef.current || didEditDateRef.current) return;
          setSelectedTask(task as UnderstoryGanttTask);
        },
      });
      observer = new MutationObserver(() => {
        window.cancelAnimationFrame(labelFrame);
        labelFrame = window.requestAnimationFrame(correctChartContent);
      });
      observeChart();
      labelFrame = window.requestAnimationFrame(() => {
        labelFrame = window.requestAnimationFrame(correctChartContent);
      });
      labelTimer = window.setTimeout(correctChartContent, 650);
      positionTimer = window.setTimeout(() => {
        timelineScroller =
          chartContainer.querySelector<HTMLElement>(".gantt-container");
        if (!timelineScroller) return;

        timelineScroller.addEventListener("scroll", rememberScrollPosition, {
          passive: true,
        });

        if (shouldCenterTimeline || !scrollPositionRef.current.hasPosition) {
          centerTimelineOnToday(timelineScroller, "auto");
          rememberScrollPosition();
          return;
        }

        timelineScroller.scrollTo({
          left: Math.min(
            scrollPositionRef.current.left,
            Math.max(timelineScroller.scrollWidth - timelineScroller.clientWidth, 0),
          ),
          top: Math.min(
            scrollPositionRef.current.top,
            Math.max(timelineScroller.scrollHeight - timelineScroller.clientHeight, 0),
          ),
          behavior: "auto",
        });
      }, 100);
    }

    void renderChart();
    return () => {
      isActive = false;
      observer?.disconnect();
      rememberScrollPosition();
      timelineScroller?.removeEventListener("scroll", rememberScrollPosition);
      window.cancelAnimationFrame(labelFrame);
      window.clearTimeout(labelTimer);
      window.clearTimeout(positionTimer);
      chartContainer.replaceChildren();
    };
  }, [queueDateChange, renderRevision, tasks, viewMode]);

  useEffect(
    () => () => {
      if (saveMessageTimerRef.current) {
        window.clearTimeout(saveMessageTimerRef.current);
      }
      if (dateSaveTimerRef.current) {
        window.clearTimeout(dateSaveTimerRef.current);
      }
    },
    [],
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E7DDEA] bg-[#FFFDF9] px-3 py-2.5 sm:px-4">
        <div>
          <p className="text-[11px] font-semibold text-[#5F3378]">
            Drag a bar to move both dates
          </p>
          <p className="mt-0.5 text-[10px] text-[#8B7895]">
            Drag either edge to change only the start or due date. Drag empty
            space to explore the timeline.
          </p>
        </div>
        <div className="flex items-center gap-2">
        {saveMessage && (
          <span
            role="status"
            className={`mr-1 text-[10px] font-semibold ${
              saveMessage.tone === "error"
                ? "text-[#A34A4A]"
                : saveMessage.tone === "saved"
                  ? "text-[#477455]"
                  : "text-[#75647F]"
            }`}
          >
            {saveMessage.text}
          </span>
        )}
        <button
          type="button"
          onClick={() => shiftTimeline(-1)}
          aria-label="Move timeline earlier"
          className="rounded-full border border-[#D8CBDF] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#5F3378] transition hover:bg-[#F7F0FB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
        >
          ← Earlier
        </button>
        <button
          type="button"
          onClick={jumpToToday}
          aria-label="Move timeline to today"
          className="rounded-full bg-[#6F3C89] px-3.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#5F3378] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => shiftTimeline(1)}
          aria-label="Move timeline later"
          className="rounded-full border border-[#D8CBDF] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#5F3378] transition hover:bg-[#F7F0FB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
        >
          Later →
        </button>
        </div>
      </div>
      {selectedTask && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#DCCFE3] bg-[#F9F3FC] px-3 py-2.5 sm:px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-[#4B3765]">
              {selectedTask.name}
            </p>
            <p className="mt-0.5 text-[9px] uppercase tracking-[0.1em] text-[#8B7895]">
              Individual work item
            </p>
          </div>
          <label className="flex items-center gap-2 text-[10px] font-semibold text-[#5F3378]">
            Status
            <select
              value={selectedTask.timelineStatus}
              disabled={isSavingStatus}
              onChange={(event) =>
                void changeSelectedStatus(
                  event.target.value as TimelineStatus,
                )
              }
              className="rounded-full border border-[#CDBAD9] bg-white px-3 py-1.5 text-[11px] text-[#4B3765] focus:border-[#7D4698] focus:outline-none disabled:opacity-60"
            >
              {(selectedTask.sourceTable === "tasks"
                ? socialTimelineStatuses
                : DIVISION_TASK_STATUSES
              ).map((status) => (
                <option key={status} value={status}>
                  {timelineStatusDetails[status].label}
                </option>
              ))}
            </select>
          </label>
          <Link
            href={selectedTask.href}
            className="text-[10px] font-semibold text-[#7D4698] hover:underline"
          >
            Open item →
          </Link>
          <button
            type="button"
            onClick={() => setSelectedTask(null)}
            aria-label="Close status editor"
            className="flex size-7 items-center justify-center rounded-full text-[#8B7895] hover:bg-white"
          >
            ×
          </button>
        </div>
      )}
      <div
        className="relative"
        onPointerDown={startPanning}
        onPointerMove={continuePanning}
        onPointerUp={stopPanning}
        onPointerCancel={stopPanning}
      >
        <div
          ref={containerRef}
          className="understory-gantt min-h-36 touch-pan-x overscroll-x-contain"
        />
      </div>
    </div>
  );
}

export function ProjectGanttBoard({
  clientSlug,
  division,
}: {
  clientSlug: WorkspaceClientSlug;
  division: Division;
}) {
  const [groups, setGroups] = useState<TaskGroup[] | null>(null);
  const [viewMode, setViewMode] = useState<GanttViewMode>("Day");
  const [error, setError] = useState<string | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);

  async function saveTimelineDates(
    task: UnderstoryGanttTask,
    startDate: string,
    dueDate: string,
  ) {
    const { error: saveError } = await supabase
      .from(task.sourceTable)
      .update({ start_date: startDate, due_date: dueDate })
      .eq("id", task.id);

    if (saveError) {
      throw new Error(`Could not save dates: ${saveError.message}`);
    }
  }

  async function saveTimelineStatus(
    task: UnderstoryGanttTask,
    status: TimelineStatus,
  ) {
    const payload =
      task.sourceTable === "tasks"
        ? {
            status: socialDatabaseStatus(status),
            posted_at: status === "posted" ? new Date().toISOString() : null,
          }
        : {
            status: status as DivisionTaskStatus,
            completed: status === "approved",
            updated_at: new Date().toISOString(),
          };
    const { error: saveError } = await supabase
      .from(task.sourceTable)
      .update(payload)
      .eq("id", task.id);

    if (saveError) {
      throw new Error(`Could not save status: ${saveError.message}`);
    }
    setRefreshRevision((current) => current + 1);
  }

  useEffect(() => {
    const table =
      division === "social-media" ? "tasks" : "division_task_items";
    const channel = supabase
      .channel(`project-gantt-${clientSlug}-${division}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => setRefreshRevision((current) => current + 1),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clientSlug, division]);

  useEffect(() => {
    let isActive = true;

    async function load() {
      setError(null);

      const clientResult = await supabase
        .from("clients")
        .select("id")
        .eq("slug", clientSlug)
        .single();

      if (!isActive) return;
      if (clientResult.error || !clientResult.data) {
        setError(
          clientResult.error?.message ??
            `Could not find the ${clientSlug} client.`,
        );
        return;
      }

      const profilesResult = await supabase
        .from("team_profile_directory")
        .select("team_username, full_name, avatar_url");

      if (!isActive) return;
      if (profilesResult.error) {
        setError(profilesResult.error.message);
        return;
      }

      const profiles = new Map<string, TeamMember>(
        (profilesResult.data ?? []).map((member) => [
          member.team_username,
          member as TeamMember,
        ]),
      );
      const clientId = clientResult.data.id;

      if (division === "social-media") {
        const [calendarsResult, postsResult] = await Promise.all([
          supabase
            .from("division_tasks")
            .select("id, title, template_type")
            .eq("client_id", clientId)
            .eq("division", "social-media")
            .eq("template_type", "content_calendar")
            .order("created_at", { ascending: true }),
          supabase
            .from("tasks")
            .select(
              "id, division_task_id, title, status, start_date, due_date, scheduled_at, internal_approvals, client_approvals, sent_to_client_at, posted_at, assigned_to, assignee_usernames, created_at",
            )
            .eq("client_id", clientId)
            .order("created_at", { ascending: true })
            .limit(1000),
        ]);

        if (!isActive) return;
        if (calendarsResult.error || postsResult.error) {
          setError(
            calendarsResult.error?.message ??
              postsResult.error?.message ??
              "Could not load social posts.",
          );
          return;
        }

        const calendars = calendarsResult.data ?? [];
        const calendarHrefs = new Map(
          calendars.map((calendar) => [
            calendar.id,
            socialCalendarHref(calendar.id),
          ]),
        );
        const latestCalendar = calendars.at(-1);
        const combinedGroup: TaskGroup = {
          taskId: `content-calendar-${clientId}`,
          taskTitle: "Content calendar",
          href: latestCalendar
            ? socialCalendarHref(latestCalendar.id)
            : "/team-hub/projects",
          items: [],
        };

        for (const post of postsResult.data ?? []) {
          const href = post.division_task_id
            ? calendarHrefs.get(post.division_task_id) ?? combinedGroup.href
            : combinedGroup.href;
          combinedGroup.items.push({
            id: post.id,
            title: post.title,
            status: socialItemStatus(post, clientSlug),
            href,
            startDate: post.start_date,
            dueDate:
              post.due_date ?? dateKeyFromTimestamp(post.scheduled_at),
            assignees: assigneesFor(
              post.assignee_usernames,
              post.assigned_to,
              profiles,
            ),
          });
        }

        setGroups(combinedGroup.items.length ? [combinedGroup] : []);
        return;
      }

      if (division === "website") {
        const websiteResult = await supabase
          .from("website_tasks")
          .select(
            "id, title, column_status, assigned_to, assignee_usernames, created_at",
          )
          .eq("client_id", clientId)
          .order("created_at", { ascending: true })
          .limit(1000);

        if (!isActive) return;
        if (websiteResult.error) {
          setError(websiteResult.error.message);
          return;
        }

        const href = `/team-hub/projects/website?client=${clientSlug}`;
        const items: TimelineItem[] = (websiteResult.data ?? []).map(
          (item) => ({
            id: item.id,
            title: item.title,
            status: websiteItemStatus(item.column_status),
            href: `${href}&task=${encodeURIComponent(item.id)}`,
            startDate: null,
            dueDate: null,
            assignees: assigneesFor(
              item.assignee_usernames,
              item.assigned_to,
              profiles,
            ),
          }),
        );
        setGroups(
          items.length
            ? [
                {
                  taskId: `website-${clientId}`,
                  taskTitle: "Website tasks",
                  href,
                  items,
                },
              ]
            : [],
        );
        return;
      }

      const tasksResult = await supabase
        .from("division_tasks")
        .select("id, title, division")
        .eq("client_id", clientId)
        .eq("division", division)
        .order("created_at", { ascending: true })
        .limit(500);

      if (!isActive) return;
      if (tasksResult.error) {
        setError(tasksResult.error.message);
        return;
      }

      const parentTasks = (tasksResult.data ?? []).filter((row) =>
        DIVISIONS.includes(row.division as Division),
      );
      if (!parentTasks.length) {
        setGroups([]);
        return;
      }

      const itemsResult = await supabase
        .from("division_task_items")
        .select(
          "id, division_task_id, title, status, start_date, due_date, assignee_usernames, created_at",
        )
        .in(
          "division_task_id",
          parentTasks.map((task) => task.id),
        )
        .order("created_at", { ascending: true })
        .limit(1000);

      if (!isActive) return;
      if (itemsResult.error) {
        setError(itemsResult.error.message);
        return;
      }

      const groupsByTask = new Map<string, TaskGroup>(
        parentTasks.map((task) => [
          task.id,
          {
            taskId: task.id,
            taskTitle: task.title,
            href: taskHref(task.id, division, clientSlug),
            items: [],
          },
        ]),
      );

      for (const row of itemsResult.data ?? []) {
        if (!isDivisionTaskStatus(row.status)) continue;
        const group = groupsByTask.get(row.division_task_id);
        if (!group) continue;
        group.items.push({
          id: row.id,
          title: row.title,
          status: row.status,
          href: group.href,
          startDate: row.start_date,
          dueDate: row.due_date,
          assignees: assigneesFor(
            row.assignee_usernames,
            null,
            profiles,
          ),
        });
      }

      setGroups(
        Array.from(groupsByTask.values()).filter(
          (group) => group.items.length > 0,
        ),
      );
    }

    void load();
    return () => {
      isActive = false;
    };
  }, [clientSlug, division, refreshRevision]);

  const preparedGroups = useMemo(
    () =>
      (groups ?? []).map((group) => {
        const scheduled = group.items
          .filter((item) => item.dueDate)
          .sort((first, second) =>
            (first.startDate ?? first.dueDate ?? "").localeCompare(
              second.startDate ?? second.dueDate ?? "",
            ),
          );
        const ganttTasks: UnderstoryGanttTask[] = scheduled.map((item) => {
          const primaryAssignee = item.assignees[0];
          const start = item.startDate ?? subtractCalendarDays(item.dueDate!, 4);
          return {
            id: item.id,
            name: item.title,
            start,
            end: item.dueDate!,
            progress: 0,
            custom_class: `gantt-status-${item.status}`,
            description: `${timelineStatusDetails[item.status].label}${item.assignees.length ? ` · ${item.assignees.map((member) => member.full_name).join(", ")}` : " · Unassigned"}`,
            thumbnail: primaryAssignee
              ? primaryAssignee.avatar_url ??
                initialsAvatarDataUrl(primaryAssignee.full_name)
              : undefined,
            href: item.href,
            sourceTable:
              division === "social-media" ? "tasks" : "division_task_items",
            timelineStatus: item.status,
            persistedStart: start,
            persistedEnd: item.dueDate!,
          };
        });
        return { group, scheduled, ganttTasks };
      }),
    [division, groups],
  );

  if (error) {
    return (
      <div className="rounded-2xl border border-[#E4B9B9] bg-[#FFF0F0] px-5 py-6 text-sm text-[#8B3E3E]">
        {error}
      </div>
    );
  }

  if (groups === null) {
    return (
      <div className="space-y-4">
        <div className="h-12 animate-pulse rounded-2xl bg-[#F1EAF5]" />
        <div className="h-64 animate-pulse rounded-[22px] bg-[#F1EAF5]" />
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[#D7CBE0] bg-[#FFFDF8] px-5 py-8 text-center text-sm text-[#75647F]">
        No task items are available for this client and division yet.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-[20px] border border-[#E1D7E6] bg-[#FFFDF8] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#9A88A4]">
            {DIVISION_LABELS[division]} · Item timeline
          </p>
          <p className="mt-1 text-sm font-semibold text-[#4B3765]">
            Every bar is an individual work item, not its parent task.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#9A88A4]">
            Scale
          </span>
          {(["Day", "Week", "Month"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698] ${
                viewMode === mode
                  ? "bg-[#341F60] text-white"
                  : "border border-[#D7CBE0] bg-white text-[#5F3378] hover:bg-[#F7F0FB]"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 px-1 text-[11px] text-[#75647F]">
        {(division === "social-media"
          ? socialTimelineStatuses
          : DIVISION_TASK_STATUSES
        ).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full gantt-legend-${status}`} />
            {timelineStatusDetails[status].label}
          </span>
        ))}
      </div>

      {preparedGroups.map(({ group, ganttTasks, scheduled }) => (
        <section
          key={group.taskId}
          className="overflow-hidden rounded-[22px] border border-[#E1D7E6] bg-white shadow-[0_7px_24px_rgba(40,21,79,0.045)]"
        >
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7DDEA] bg-[linear-gradient(135deg,#FFFDF8,#F7F0FB)] px-4 py-4 sm:px-5">
            <div>
              <h3 className="text-base font-semibold text-[#341F60]">
                {group.taskTitle}
              </h3>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.11em] text-[#9A88A4]">
                {scheduled.length} scheduled items
              </p>
            </div>
            <Link
              href={group.href}
              className="text-xs font-semibold text-[#7D4698] hover:underline"
            >
              Manage items →
            </Link>
          </header>

          {ganttTasks.length ? (
            <div className="min-w-0 overflow-hidden bg-[#FFFEFB] p-3 sm:p-4">
              <FrappeItemChart
                tasks={ganttTasks}
                viewMode={viewMode}
                onDateChange={saveTimelineDates}
                onStatusChange={saveTimelineStatus}
              />
            </div>
          ) : (
            <p className="border-b border-[#EFE7F2] bg-[#FFFEFB] px-5 py-6 text-sm text-[#8B7895]">
              Add a deadline to an item to place it on this timeline.
            </p>
          )}

        </section>
      ))}
    </div>
  );
}
