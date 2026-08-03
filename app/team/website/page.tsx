"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ClientSelect } from "@/app/_components/ClientSelect";
import {
  readTeamSessionProfile,
  type TeamAccessLevel,
} from "@/app/team-hub/_components/TeamIdentity";
import {
  WORKSPACE_CLIENTS,
  WORKSPACE_CLIENT_SLUGS,
  isWorkspaceClientSlug,
  type WorkspaceClientSlug,
} from "@/lib/workspace-clients";
import { sendSlackNotification } from "@/lib/slack-notifications";
import { useOptionalProjectTheme } from "@/app/team-hub/projects/_components/ProjectThemeProvider";
import { TaskItemsEditor } from "@/app/team-hub/projects/_components/TaskItemsEditor";
import { UnderstoryBrand } from "../_components/UnderstoryBrand";

type ClientSlug = WorkspaceClientSlug;
type ColumnStatus =
  | "needs_content"
  | "ux_design"
  | "ui_design"
  | "in_progress"
  | "qa_testing"
  | "review"
  | "done";
type StatusFilter = ColumnStatus | "all";
type Priority = "normal" | "high";

type WebsiteTask = {
  id: string;
  client_id: string;
  title: string;
  description: string;
  column_status: ColumnStatus;
  priority: Priority;
  live_url: string | null;
  created_at: string;
};

type PageComment = {
  id: string;
  task_id: string;
  author: string;
  comment: string;
  created_at: string;
};

type PageCommentPin = {
  id: string;
  task_id: string;
  x_percent: number;
  y_percent: number;
  comment: string;
  author: string;
  resolved: boolean;
  created_at: string;
};

type ClientRow = {
  id: string;
  name: string;
  slug: string;
};

const columns: Array<{
  id: ColumnStatus;
  label: string;
  dot: string;
  tint: string;
  text: string;
}> = [
  {
    id: "needs_content",
    label: "Needs content",
    dot: "#9A477B",
    tint: "#FAEAF5",
    text: "#75335D",
  },
  {
    id: "ux_design",
    label: "UX design",
    dot: "#7D4698",
    tint: "#EEE3FA",
    text: "#5F3378",
  },
  {
    id: "ui_design",
    label: "UI design",
    dot: "#A865C5",
    tint: "#F4E9FA",
    text: "#74408C",
  },
  {
    id: "in_progress",
    label: "In progress",
    dot: "#D0A323",
    tint: "#FFF4C7",
    text: "#725A00",
  },
  {
    id: "qa_testing",
    label: "QA testing",
    dot: "#6656A8",
    tint: "#ECE9FA",
    text: "#493B86",
  },
  {
    id: "review",
    label: "Needs review",
    dot: "#C18400",
    tint: "#FFF0BC",
    text: "#725000",
  },
  {
    id: "done",
    label: "Live",
    dot: "#6D967A",
    tint: "#EAF3ED",
    text: "#3F6D4E",
  },
];

const summaryMetrics: Array<{
  id: string;
  label: string;
  statuses: ColumnStatus[];
  dot: string;
  text: string;
}> = [
  {
    id: "needs_content",
    label: "Needs content",
    statuses: ["needs_content"],
    dot: "#9A477B",
    text: "#75335D",
  },
  {
    id: "design",
    label: "Design",
    statuses: ["ux_design", "ui_design"],
    dot: "#7D4698",
    text: "#5F3378",
  },
  {
    id: "build_qa",
    label: "Build & QA",
    statuses: ["in_progress", "qa_testing"],
    dot: "#D0A323",
    text: "#725A00",
  },
  {
    id: "review",
    label: "Needs review",
    statuses: ["review"],
    dot: "#C18400",
    text: "#725000",
  },
  {
    id: "live",
    label: "Live",
    statuses: ["done"],
    dot: "#6D967A",
    text: "#3F6D4E",
  },
];

function isColumnStatus(value: string): value is ColumnStatus {
  return [
    "needs_content",
    "ux_design",
    "ui_design",
    "in_progress",
    "qa_testing",
    "review",
    "done",
  ].includes(value);
}

function isPriority(value: string): value is Priority {
  return value === "normal" || value === "high";
}

function Icon({
  name,
  className = "size-5",
}: {
  name:
    | "plus"
    | "close"
    | "edit"
    | "trash"
    | "arrow"
    | "pin"
    | "check";
  className?: string;
}) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    close: <path d="M18 6 6 18M6 6l12 12" />,
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6" />
        <path d="M10 11v5M14 11v5" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    pin: (
      <>
        <path d="m14 4 6 6" />
        <path d="m17 7-4.5 4.5M9.5 8.5l6 6" />
        <path d="m11.5 14.5-5 5M7 11l6-6 6 6-6 6Z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
  };

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
        priority === "high"
          ? "border-[#E6C4B8] bg-[#FFF0EA] text-[#A1533A]"
          : "border-[#E0D4E8] bg-[#F7F1FB] text-[#75647F]"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          priority === "high" ? "bg-[#C86648]" : "bg-[#A693AF]"
        }`}
      />
      {priority}
    </span>
  );
}

function formatTaskDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function TaskListRow({
  task,
  onOpen,
}: {
  task: WebsiteTask;
  onOpen: () => void;
}) {
  const column = columns.find((candidate) => candidate.id === task.column_status);

  return (
    <article
      tabIndex={0}
      role="button"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="group flex cursor-pointer flex-col gap-4 border-b border-[#E9E0EF] px-4 py-5 outline-none transition last:border-b-0 hover:bg-[#FCF8FF] focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7D4698] sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="text-sm font-semibold leading-5 text-[#341F60] sm:text-[15px]">
            {task.title}
          </h3>
          {task.priority === "high" && <PriorityBadge priority="high" />}
        </div>
        <p className="mt-1.5 text-xs text-[#8B7895]">
          Website team · Added {formatTaskDate(task.created_at)}
        </p>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
          style={{ backgroundColor: column?.tint, color: column?.text }}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ backgroundColor: column?.dot }}
          />
          {column?.label}
        </span>
        <span className="flex size-8 items-center justify-center rounded-full border border-[#E3D8EA] bg-white text-[#9B88A5] transition group-hover:border-[#BBA9C6] group-hover:text-[#7D4698]">
          <Icon name="arrow" className="size-3.5" />
          <span className="sr-only">Open task</span>
        </span>
      </div>
    </article>
  );
}

function AddTaskModal({
  clientName,
  column,
  onClose,
  onCreate,
}: {
  clientName: string;
  column: { id: ColumnStatus; label: string };
  onClose: () => void;
  onCreate: (values: {
    title: string;
    description: string;
    priority: Priority;
  }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setIsSaving(true);
    const didCreate = await onCreate({
      title: title.trim(),
      description: description.trim(),
      priority,
    });
    setIsSaving(false);
    if (didCreate) onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-task-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#341F60]/35 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-[24px] border border-[#E0D4E8] bg-white p-5 shadow-[0_24px_80px_rgba(52,31,96,0.22)] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B7895]">
              {clientName} · {column.label}
            </p>
            <h2
              id="add-task-title"
              className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[#341F60]"
            >
              Add website task
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full border border-[#E0D4E8] text-[#75647F] hover:bg-[#EEE3FA]"
          >
            <Icon name="close" className="size-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-5">
          <label className="block">
            <span className="text-xs font-semibold text-[#695677]">Title</span>
            <input
              required
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#DED0E7] bg-[#FFFCF7] px-3.5 py-3 text-sm text-[#341F60] outline-none transition focus:border-[#7D4698] focus:ring-2 focus:ring-[#7D4698]/20"
              placeholder="Task title"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-[#695677]">
              Description
            </span>
            <textarea
              rows={5}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-2 w-full resize-none rounded-xl border border-[#DED0E7] bg-[#FFFCF7] px-3.5 py-3 text-sm leading-6 text-[#341F60] outline-none transition focus:border-[#7D4698] focus:ring-2 focus:ring-[#7D4698]/20"
              placeholder="What needs to be done?"
            />
          </label>

          <fieldset>
            <legend className="text-xs font-semibold text-[#695677]">
              Priority
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["normal", "high"] as Priority[]).map((option) => (
                <label
                  key={option}
                  className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-xs font-semibold capitalize transition ${
                    priority === option
                      ? "border-[#7D4698] bg-[#EEE3FA] text-[#5F3378]"
                      : "border-[#E0D4E8] text-[#75647F] hover:bg-[#F7F1FB]"
                  }`}
                >
                  <input
                    type="radio"
                    name="priority"
                    value={option}
                    checked={priority === option}
                    onChange={() => setPriority(option)}
                    className="sr-only"
                  />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2 border-t border-[#E9E0EF] pt-5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#DED0E7] px-4 py-2.5 text-xs font-semibold text-[#75647F] hover:bg-[#F5EEFA]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !title.trim()}
              className="rounded-full bg-[#7D4698] px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#6A3A82] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isSaving ? "Adding…" : "Add task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LiveWebsitePreview({
  taskId,
  url,
  canManage,
}: {
  taskId: string;
  url: string;
  canManage: boolean;
}) {
  const [previewState, setPreviewState] = useState<
    "loading" | "loaded" | "failed"
  >("loading");
  const [pins, setPins] = useState<PageCommentPin[]>([]);
  const [isLoadingPins, setIsLoadingPins] = useState(true);
  const [isPinMode, setIsPinMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<{
    xPercent: number;
    yPercent: number;
  } | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [pinComment, setPinComment] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [busyPinId, setBusyPinId] = useState<string | null>(null);
  const [confirmDeletePinId, setConfirmDeletePinId] = useState<string | null>(
    null,
  );
  const previewCanvasHeight = 3200;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPreviewState((current) =>
        current === "loading" ? "failed" : current,
      );
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadPins() {
      setIsLoadingPins(true);
      const { data, error } = await supabase
        .from("page_comment_pins")
        .select(
          "id, task_id, x_percent, y_percent, comment, author, resolved, created_at",
        )
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });

      if (!isActive) return;
      if (error) {
        setPinError(`Could not load comment pins: ${error.message}`);
        setPins([]);
      } else {
        setPins((data ?? []) as PageCommentPin[]);
        setPinError(null);
      }
      setIsLoadingPins(false);
    }

    void loadPins();
    return () => {
      isActive = false;
    };
  }, [taskId]);

  useEffect(() => {
    if (!confirmDeletePinId) return;

    const timeout = window.setTimeout(() => {
      setConfirmDeletePinId(null);
    }, 3500);
    return () => window.clearTimeout(timeout);
  }, [confirmDeletePinId]);

  function placePin(event: React.MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const xPercent = ((event.clientX - bounds.left) / bounds.width) * 100;
    const yPercent = ((event.clientY - bounds.top) / bounds.height) * 100;

    setPendingPin({
      xPercent: Math.min(100, Math.max(0, xPercent)),
      yPercent: Math.min(100, Math.max(0, yPercent)),
    });
    setSelectedPinId(null);
    setPinComment("");
    setPinError(null);
  }

  async function savePin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const comment = pinComment.trim();
    if (!pendingPin || !comment) return;

    setIsSavingPin(true);
    const { data, error } = await supabase
      .from("page_comment_pins")
      .insert({
        task_id: taskId,
        x_percent: pendingPin.xPercent,
        y_percent: pendingPin.yPercent,
        comment,
        author: "Karen",
      })
      .select(
        "id, task_id, x_percent, y_percent, comment, author, resolved, created_at",
      )
      .single();
    setIsSavingPin(false);

    if (error) {
      setPinError(`Could not save the comment pin: ${error.message}`);
      return;
    }

    setPins((current) => [...current, data as PageCommentPin]);
    setPendingPin(null);
    setPinComment("");
    setPinError(null);
  }

  async function resolvePin(pinId: string) {
    const pin = pins.find((candidate) => candidate.id === pinId);
    if (!pin || pin.resolved) return;

    setBusyPinId(pinId);
    setPins((current) =>
      current.map((candidate) =>
        candidate.id === pinId ? { ...candidate, resolved: true } : candidate,
      ),
    );

    const { error } = await supabase
      .from("page_comment_pins")
      .update({ resolved: true })
      .eq("id", pinId);
    setBusyPinId(null);

    if (error) {
      setPins((current) =>
        current.map((candidate) =>
          candidate.id === pinId ? { ...candidate, resolved: false } : candidate,
        ),
      );
      setPinError(`Could not resolve the comment pin: ${error.message}`);
      return;
    }

    setSelectedPinId(null);
    setPinError(null);
  }

  async function deletePin(pinId: string) {
    if (confirmDeletePinId !== pinId) {
      setConfirmDeletePinId(pinId);
      return;
    }

    setBusyPinId(pinId);
    const { error } = await supabase
      .from("page_comment_pins")
      .delete()
      .eq("id", pinId);
    setBusyPinId(null);

    if (error) {
      setPinError(`Could not delete the comment pin: ${error.message}`);
      return;
    }

    setPins((current) => current.filter((pin) => pin.id !== pinId));
    setSelectedPinId(null);
    setConfirmDeletePinId(null);
    setPinError(null);
  }

  function getPopoverStyle(xPercent: number, yPercent: number) {
    return {
      left: `${Math.min(82, Math.max(18, xPercent))}%`,
      top: `${yPercent}%`,
      transform:
        yPercent > 62
          ? "translate(-50%, calc(-100% - 14px))"
          : "translate(-50%, 14px)",
    };
  }

  if (previewState === "failed") {
    return (
      <div className="mx-auto flex min-h-72 w-full max-w-[960px] flex-col items-center justify-center rounded-2xl border border-[#DED0E7] bg-[#F5EEFA] px-7 text-center shadow-[0_18px_45px_rgba(52,31,96,0.12)]">
        <p className="text-sm font-semibold leading-6 text-[#4F3D69]">
          This site can&apos;t be previewed here — open it directly instead.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#7D4698] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#6A3A82]"
        >
          Open live site
          <Icon name="arrow" className="size-3.5" />
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto mb-3 flex w-full max-w-[960px] flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#4F3D69]">Live preview</p>
          <p className="mt-0.5 text-[10px] text-[#8B7895]">
            {isLoadingPins
              ? "Loading comment pins…"
              : `${pins.length} comment pin${pins.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            aria-pressed={isPinMode}
            onClick={() => {
              setIsPinMode((current) => !current);
              setPendingPin(null);
              setSelectedPinId(null);
              setConfirmDeletePinId(null);
              setPinComment("");
            }}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold transition ${
              isPinMode
                ? "border-[#7D4698] bg-[#7D4698] text-white"
                : "border-[#DED0E7] bg-white text-[#5F3378] hover:bg-[#EEE3FA]"
            }`}
          >
            <Icon name="pin" className="size-3.5" />
            {isPinMode ? "Click preview to place pin" : "Add comment pin"}
          </button>
        )}
      </div>

      <div className="relative mx-auto h-[620px] w-full max-w-[960px] overflow-hidden rounded-2xl border border-[#CDBAD9] bg-white shadow-[0_18px_45px_rgba(52,31,96,0.14)] sm:h-[680px]">
        <div className="flex h-10 items-center gap-2 border-b border-[#DED0E7] bg-[#F5EEFA] px-4">
          <span className="size-2.5 rounded-full bg-[#D9A4C5]" />
          <span className="size-2.5 rounded-full bg-[#F4CE45]" />
          <span className="size-2.5 rounded-full bg-[#B9A2D5]" />
          <span className="ml-3 min-w-0 flex-1 truncate rounded-full border border-[#E0D4E8] bg-white px-3 py-1 text-[10px] text-[#8B7895]">
            {url}
          </span>
        </div>

        <div className="h-[calc(100%_-_2.5rem)] overflow-y-auto overscroll-contain bg-white">
          <div
            className="relative w-full"
            style={{ height: previewCanvasHeight }}
          >
            <iframe
              title="Live website preview"
              src={url}
              onLoad={() => setPreviewState("loaded")}
              className="pointer-events-none absolute inset-0 h-full w-full bg-white lg:h-[150%] lg:w-[150%] lg:origin-top-left lg:scale-[0.6666667]"
              referrerPolicy="strict-origin-when-cross-origin"
              scrolling="no"
            />

            {previewState === "loading" && (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-[640px] items-center justify-center bg-white/90 text-xs font-medium text-[#75647F]">
                Loading live preview…
              </div>
            )}

            {isPinMode && (
              <div
                role="button"
                tabIndex={0}
                aria-label="Place a comment pin on the preview"
                onClick={placePin}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setPendingPin(null);
                    setIsPinMode(false);
                  }
                }}
                className="absolute inset-0 z-20 cursor-crosshair bg-[#7D4698]/[0.04] outline-none ring-inset focus-visible:ring-2 focus-visible:ring-[#7D4698]"
              />
            )}

            {pins.map((pin, index) => (
              <button
                key={pin.id}
                type="button"
                aria-label={`Open comment pin ${index + 1}`}
                onClick={() => {
                  setSelectedPinId((current) =>
                    current === pin.id ? null : pin.id,
                  );
                  setPendingPin(null);
                  setConfirmDeletePinId(null);
                }}
                className={`absolute z-30 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-[0_4px_14px_rgba(52,31,96,0.28)] transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4CE45] ${
                  pin.resolved ? "bg-[#9B8FA2]" : "bg-[#7D4698]"
                }`}
                style={{
                  left: `${pin.x_percent}%`,
                  top: `${pin.y_percent}%`,
                }}
              >
                {index + 1}
              </button>
            ))}

            {pendingPin && (
              <>
                <span
                  className="pointer-events-none absolute z-30 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#F4CE45] text-[10px] font-bold text-[#341F60] shadow-[0_4px_14px_rgba(52,31,96,0.28)]"
                  style={{
                    left: `${pendingPin.xPercent}%`,
                    top: `${pendingPin.yPercent}%`,
                  }}
                >
                  {pins.length + 1}
                </span>
                <form
                  onSubmit={savePin}
                  onClick={(event) => event.stopPropagation()}
                  className="absolute z-40 w-[min(300px,calc(100%_-_24px))] rounded-2xl border border-[#D8C6E4] bg-white p-4 shadow-[0_16px_45px_rgba(52,31,96,0.2)]"
                  style={getPopoverStyle(
                    pendingPin.xPercent,
                    pendingPin.yPercent,
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-[#341F60]">
                      Pin {pins.length + 1}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingPin(null);
                        setPinComment("");
                      }}
                      className="text-[#8B7895] hover:text-[#341F60]"
                    >
                      <Icon name="close" className="size-3.5" />
                      <span className="sr-only">Cancel pin</span>
                    </button>
                  </div>
                  <textarea
                    autoFocus
                    rows={3}
                    value={pinComment}
                    onChange={(event) => setPinComment(event.target.value)}
                    placeholder="What should change here?"
                    className="mt-3 w-full resize-none rounded-xl border border-[#DED0E7] bg-[#FFFCF7] px-3 py-2.5 text-xs leading-5 text-[#341F60] outline-none focus:border-[#7D4698] focus:ring-2 focus:ring-[#7D4698]/20"
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      type="submit"
                      disabled={isSavingPin || !pinComment.trim()}
                      className="rounded-full bg-[#7D4698] px-4 py-2 text-[11px] font-semibold text-white hover:bg-[#6A3A82] disabled:opacity-45"
                    >
                      {isSavingPin ? "Saving…" : "Save pin"}
                    </button>
                  </div>
                </form>
              </>
            )}

            {pins.map((pin, index) =>
              selectedPinId === pin.id ? (
                <div
                  key={`popover-${pin.id}`}
                  className="absolute z-40 w-[min(300px,calc(100%_-_24px))] rounded-2xl border border-[#D8C6E4] bg-white p-4 shadow-[0_16px_45px_rgba(52,31,96,0.2)]"
                  style={getPopoverStyle(pin.x_percent, pin.y_percent)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-[#341F60]">
                        Pin {index + 1} · {pin.author}
                      </p>
                      <time className="mt-0.5 block text-[10px] text-[#8B7895]">
                        {formatCommentDate(pin.created_at)}
                      </time>
                    </div>
                    {canManage && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void resolvePin(pin.id)}
                        disabled={pin.resolved || busyPinId === pin.id}
                        aria-label={
                          pin.resolved
                            ? `Pin ${index + 1} is resolved`
                            : `Mark pin ${index + 1} as resolved`
                        }
                        className={`flex size-7 items-center justify-center rounded-full border transition disabled:cursor-default ${
                          pin.resolved
                            ? "border-[#93B59D] bg-[#DDEEE2] text-[#3F6D4E]"
                            : "border-[#BBD3C2] bg-[#EDF7F0] text-[#477156] hover:bg-[#DDEEE2] disabled:opacity-45"
                        }`}
                      >
                        <Icon name="check" className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deletePin(pin.id)}
                        disabled={busyPinId === pin.id}
                        aria-label={
                          confirmDeletePinId === pin.id
                            ? `Confirm deletion of pin ${index + 1}`
                            : `Delete pin ${index + 1}`
                        }
                        className={`flex size-7 items-center justify-center rounded-full border text-[#A1533A] transition disabled:opacity-45 ${
                          confirmDeletePinId === pin.id
                            ? "border-[#C86648] bg-[#FFDCD0] ring-2 ring-[#C86648]/25"
                            : "border-[#E6C4B8] bg-[#FFF1EA] hover:bg-[#FFE4D9]"
                        }`}
                      >
                        <Icon name="close" className="size-3.5" />
                      </button>
                    </div>
                    )}
                  </div>
                  {confirmDeletePinId === pin.id && (
                    <p className="mt-2 text-right text-[9px] font-semibold text-[#A1533A]">
                      Click the red X again to confirm delete
                    </p>
                  )}
                  <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[#695677]">
                    {pin.comment}
                  </p>
                </div>
              ) : null,
            )}
          </div>
        </div>
      </div>

      {pinError && (
        <p className="mx-auto mt-3 w-full max-w-[960px] rounded-xl bg-[#FFF1EA] px-3 py-2 text-xs text-[#98573F]">
          {pinError}
        </p>
      )}
    </div>
  );
}

function formatCommentDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function TaskDetailPanel({
  task,
  onClose,
  onSave,
  onSaveLiveUrl,
  onChangeStatus,
  onMarkReady,
  onDelete,
  canManage,
  actorName,
}: {
  task: WebsiteTask;
  onClose: () => void;
  onSave: (values: {
    title: string;
    description: string;
    priority: Priority;
  }) => Promise<boolean>;
  onSaveLiveUrl: (liveUrl: string | null) => Promise<boolean>;
  onChangeStatus: (status: ColumnStatus) => Promise<boolean>;
  onMarkReady: () => Promise<boolean>;
  onDelete: () => Promise<void>;
  canManage: boolean;
  actorName: string;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [liveUrlDraft, setLiveUrlDraft] = useState(task.live_url ?? "");
  const [savedLiveUrl, setSavedLiveUrl] = useState(task.live_url ?? "");
  const [comments, setComments] = useState<PageComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [isSavingUrl, setIsSavingUrl] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isMarkingReady, setIsMarkingReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const column = columns.find((candidate) => candidate.id === task.column_status);

  useEffect(() => {
    let isActive = true;

    async function loadComments() {
      setIsLoadingComments(true);
      const { data, error } = await supabase
        .from("page_comments")
        .select("id, task_id, author, comment, created_at")
        .eq("task_id", task.id)
        .order("created_at", { ascending: true });

      if (!isActive) return;
      if (error) {
        setCommentError(`Could not load comments: ${error.message}`);
        setIsLoadingComments(false);
        return;
      }

      setComments((data ?? []) as PageComment[]);
      setCommentError(null);
      setIsLoadingComments(false);
    }

    void loadComments();
    return () => {
      isActive = false;
    };
  }, [task.id]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setIsSaving(true);
    const didSave = await onSave({
      title: title.trim(),
      description: description.trim(),
      priority,
    });
    setIsSaving(false);
    if (didSave) onClose();
  }

  async function saveLiveUrl(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = liveUrlDraft.trim();
    if (value) {
      try {
        const parsedUrl = new URL(value);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error();
      } catch {
        setCommentError("Enter a complete URL beginning with http:// or https://.");
        return;
      }
    }

    setIsSavingUrl(true);
    const didSave = await onSaveLiveUrl(value || null);
    setIsSavingUrl(false);
    if (didSave) {
      setSavedLiveUrl(value);
      setCommentError(null);
    }
  }

  async function addComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const comment = commentDraft.trim();
    if (!comment) return;

    setIsAddingComment(true);
    const { data, error } = await supabase
      .from("page_comments")
      .insert({ task_id: task.id, author: actorName, comment })
      .select("id, task_id, author, comment, created_at")
      .single();
    setIsAddingComment(false);

    if (error) {
      setCommentError(`Could not add the comment: ${error.message}`);
      return;
    }

    setComments((current) => [...current, data as PageComment]);
    setCommentDraft("");
    setCommentError(null);
  }

  async function markReady() {
    setIsMarkingReady(true);
    const didUpdate = await onMarkReady();
    setIsMarkingReady(false);
    if (didUpdate) setCommentError(null);
  }

  async function changeStatus(event: React.ChangeEvent<HTMLSelectElement>) {
    const status = event.target.value;
    if (!isColumnStatus(status) || status === task.column_status) return;

    setIsUpdatingStatus(true);
    const didUpdate = await onChangeStatus(status);
    setIsUpdatingStatus(false);
    if (didUpdate) setCommentError(null);
  }

  async function removeTask() {
    if (!window.confirm("Delete this website task? This cannot be undone.")) {
      return;
    }
    setIsDeleting(true);
    await onDelete();
    setIsDeleting(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-detail-title"
      className="fixed inset-0 z-50 flex justify-end bg-[#341F60]/30 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="h-full w-full max-w-[1100px] overflow-y-auto border-l border-[#E0D4E8] bg-white p-5 shadow-[-18px_0_60px_rgba(52,31,96,0.16)] sm:p-8 lg:p-10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#695677]"
              style={{ backgroundColor: column?.tint, color: column?.text }}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: column?.dot }}
              />
              {column?.label}
            </span>
            <h2
              id="task-detail-title"
              className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#341F60] sm:text-3xl"
            >
              {task.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#E0D4E8] text-[#75647F] hover:bg-[#EEE3FA]"
          >
            <Icon name="close" className="size-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <section className="mt-6 rounded-2xl border border-[#E5DBEC] bg-[#FCF8FF] p-4">
          <label className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              <span className="block text-xs font-semibold text-[#4F3D69]">
                Page status
              </span>
              <span className="mt-0.5 block text-[10px] text-[#8B7895]">
                Update where this page is in the website workflow.
              </span>
            </span>
            <select
              value={task.column_status}
              onChange={(event) => void changeStatus(event)}
              disabled={isUpdatingStatus}
              className="min-w-44 rounded-xl border border-[#DED0E7] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#4F3D69] outline-none transition focus:border-[#7D4698] focus:ring-2 focus:ring-[#7D4698]/20 disabled:opacity-55"
            >
              {columns.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="mt-8 border-t border-[#E5DBEC] pt-7">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-[#341F60]">Live URL</h3>
            <p className="mt-1 text-xs text-[#8B7895]">
              Save the published page address to preview it here.
            </p>
          </div>
          {canManage ? (
          <form onSubmit={saveLiveUrl} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              value={liveUrlDraft}
              onChange={(event) => setLiveUrlDraft(event.target.value)}
              placeholder="Paste the live URL once this page is up"
              className="min-w-0 flex-1 rounded-xl border border-[#DED0E7] bg-[#FFFCF7] px-3.5 py-3 text-sm text-[#341F60] outline-none transition focus:border-[#7D4698] focus:ring-2 focus:ring-[#7D4698]/20"
            />
            <button
              type="submit"
              disabled={isSavingUrl}
              className="rounded-xl bg-[#7D4698] px-4 py-3 text-xs font-semibold text-white hover:bg-[#6A3A82] disabled:opacity-45"
            >
              {isSavingUrl ? "Saving…" : "Save URL"}
            </button>
          </form>
          ) : (
            <p className="rounded-xl border border-[#E5DBEC] bg-[#FCF8FF] px-4 py-3 text-sm text-[#695677]">
              {savedLiveUrl || "No live URL has been saved yet."}
            </p>
          )}
        </section>

        {savedLiveUrl && (
          <section className="mt-8">
            <LiveWebsitePreview
              key={savedLiveUrl}
              taskId={task.id}
              url={savedLiveUrl}
              canManage={canManage}
            />
            <div className="mt-3 text-center">
              <a
                href={savedLiveUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#7D4698] hover:text-[#7D4698]"
              >
                Open live site in a new tab
                <Icon name="arrow" className="size-3.5" />
              </a>
            </div>
          </section>
        )}

        <section className="mt-9 border-t border-[#E5DBEC] pt-7">
          {savedLiveUrl ? (
            <div>
              <h3 className="text-lg font-semibold text-[#341F60]">
                Comments and edit requests
              </h3>
              <p className="mt-1 text-xs text-[#8B7895]">
                Keep page feedback together with the live preview.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#E2CA98] bg-[#FFF8E9] p-4">
              <p className="text-sm font-semibold leading-6 text-[#725727]">
                This page hasn&apos;t been built yet — jot down what it should include
              </p>
              {canManage && task.column_status !== "needs_content" && (
                <button
                  type="button"
                  onClick={() => void markReady()}
                  disabled={isMarkingReady}
                  className="mt-3 rounded-full border border-[#CFB77F] bg-white px-3.5 py-2 text-xs font-semibold text-[#765B28] hover:bg-[#FFFCF5] disabled:opacity-45"
                >
                  {isMarkingReady ? "Updating…" : "Mark as ready to start"}
                </button>
              )}
            </div>
          )}

          <div className="mt-5 space-y-3">
            {isLoadingComments ? (
              <div className="h-20 animate-pulse rounded-2xl bg-[#F3ECF8]" />
            ) : comments.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[#E0D4E8] px-4 py-6 text-center text-xs text-[#8B7895]">
                No comments yet.
              </p>
            ) : (
              comments.map((comment) => (
                <article
                  key={comment.id}
                  className="rounded-2xl border border-[#E5DBEC] bg-[#FCF8FF] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[#4F3D69]">
                      {comment.author}
                    </p>
                    <time className="text-[10px] text-[#8B7895]">
                      {formatCommentDate(comment.created_at)}
                    </time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#695677]">
                    {comment.comment}
                  </p>
                </article>
              ))
            )}
          </div>

          {canManage && (
          <form onSubmit={addComment} className="mt-5">
            <label className="block">
              <span className="text-xs font-semibold text-[#695677]">
                Add a comment
              </span>
              <textarea
                rows={4}
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder="Write a note or edit request…"
                className="mt-2 w-full resize-none rounded-xl border border-[#DED0E7] bg-[#FFFCF7] px-3.5 py-3 text-sm leading-6 text-[#341F60] outline-none transition focus:border-[#7D4698] focus:ring-2 focus:ring-[#7D4698]/20"
              />
            </label>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[10px] text-[#8B7895]">
                Posting as {actorName}
              </p>
              <button
                type="submit"
                disabled={isAddingComment || !commentDraft.trim()}
                className="rounded-full bg-[#7D4698] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#6A3A82] disabled:opacity-45"
              >
                {isAddingComment ? "Adding…" : "Add comment"}
              </button>
            </div>
          </form>
          )}

          {commentError && (
            <p className="mt-3 rounded-xl bg-[#FFF1EA] px-3 py-2 text-xs text-[#98573F]">
              {commentError}
            </p>
          )}
        </section>

        {canManage && (
        <section className="mt-9 border-t border-[#E5DBEC] pt-7">
          <h3 className="text-lg font-semibold text-[#341F60]">Page details</h3>
          <form onSubmit={submit} className="mt-5 space-y-6">
            <label className="block">
              <span className="text-xs font-semibold text-[#695677]">Title</span>
              <input
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-2 w-full rounded-xl border border-[#DED0E7] bg-[#FFFCF7] px-3.5 py-3 text-sm text-[#341F60] outline-none transition focus:border-[#7D4698] focus:ring-2 focus:ring-[#7D4698]/20"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-[#695677]">
                Description
              </span>
              <textarea
                rows={7}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mt-2 w-full resize-none rounded-xl border border-[#DED0E7] bg-[#FFFCF7] px-3.5 py-3 text-sm leading-6 text-[#341F60] outline-none transition focus:border-[#7D4698] focus:ring-2 focus:ring-[#7D4698]/20"
              />
            </label>

            <fieldset>
              <legend className="text-xs font-semibold text-[#695677]">
                Priority
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["normal", "high"] as Priority[]).map((option) => (
                  <label
                    key={option}
                    className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-xs font-semibold capitalize transition ${
                      priority === option
                        ? "border-[#7D4698] bg-[#EEE3FA] text-[#5F3378]"
                        : "border-[#E0D4E8] text-[#75647F] hover:bg-[#F7F1FB]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="edit-priority"
                      value={option}
                      checked={priority === option}
                      onChange={() => setPriority(option)}
                      className="sr-only"
                    />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col-reverse gap-3 border-t border-[#E9E0EF] pt-6 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => void removeTask()}
                disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#E6C4B8] px-4 py-2.5 text-xs font-semibold text-[#A1533A] transition hover:bg-[#FFF2ED] disabled:opacity-45"
              >
                <Icon name="trash" className="size-4" />
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-[#DED0E7] px-4 py-2.5 text-xs font-semibold text-[#75647F] hover:bg-[#F5EEFA]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !title.trim()}
                  className="inline-flex items-center gap-2 rounded-full bg-[#7D4698] px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#6A3A82] disabled:opacity-45"
                >
                  <Icon name="edit" className="size-3.5" />
                  {isSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </form>
        </section>
        )}
      </aside>
    </div>
  );
}

function WebsiteDevelopmentDashboard() {
  const searchParams = useSearchParams();
  const projectTheme = useOptionalProjectTheme();
  const requestedClient = searchParams.get("client");
  const requestedTaskId = searchParams.get("task");
  const initialClient: ClientSlug =
    isWorkspaceClientSlug(requestedClient) ? requestedClient : "mvp";
  const [selectedClient, setSelectedClient] =
    useState<ClientSlug>(initialClient);
  const [clientIds, setClientIds] = useState<Partial<Record<ClientSlug, string>>>(
    {},
  );
  const [tasks, setTasks] = useState<WebsiteTask[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addTaskColumn, setAddTaskColumn] = useState<ColumnStatus | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [teamProfile, setTeamProfile] = useState<{
    name: string;
    accessLevel: TeamAccessLevel;
  } | null>(null);
  const [isTeamProfileReady, setIsTeamProfileReady] = useState(false);

  const currentClientId = clientIds[selectedClient];
  const canManage = teamProfile?.accessLevel === "owner";
  const clientOptions = WORKSPACE_CLIENT_SLUGS.map((slug) => ({
    value: slug,
    label: WORKSPACE_CLIENTS[slug].name,
  }));
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const statusCounts = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [
          column.id,
          tasks.filter((task) => task.column_status === column.id).length,
        ]),
      ) as Record<ColumnStatus, number>,
    [tasks],
  );
  const filteredTasks = useMemo(
    () =>
      statusFilter === "all"
        ? tasks
        : tasks.filter((task) => task.column_status === statusFilter),
    [statusFilter, tasks],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const profile = readTeamSessionProfile();
      setTeamProfile(
        profile
          ? {
              name: profile.name,
              accessLevel: profile.accessLevel,
            }
          : null,
      );
      setIsTeamProfileReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadClients() {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, slug")
        .in("slug", WORKSPACE_CLIENT_SLUGS);

      if (!isActive) return;
      if (error) {
        setErrorMessage(`Could not load clients: ${error.message}`);
        setIsLoadingClients(false);
        return;
      }

      const ids: Partial<Record<ClientSlug, string>> = {};
      (data as ClientRow[]).forEach((client) => {
        if (isWorkspaceClientSlug(client.slug)) {
          ids[client.slug] = client.id;
        }
      });
      setClientIds(ids);
      setIsLoadingClients(false);
      setErrorMessage(null);
    }

    void loadClients();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!currentClientId || !isTeamProfileReady || !teamProfile) {
      return;
    }

    let isActive = true;
    async function loadTasks() {
      setIsLoadingTasks(true);
      const query = supabase
        .from("website_tasks")
        .select(
          "id, client_id, title, description, column_status, priority, live_url, created_at",
        )
        .eq("client_id", currentClientId)
        .order("created_at", { ascending: true });
      const { data, error } = await query;

      if (!isActive) return;
      if (error) {
        setErrorMessage(`Could not load website tasks: ${error.message}`);
        setTasks([]);
        setIsLoadingTasks(false);
        return;
      }

      const loadedTasks = (data ?? []).map((task) => ({
        ...task,
        description: task.description ?? "",
        live_url: task.live_url ?? null,
        column_status: isColumnStatus(task.column_status)
          ? task.column_status
          : "needs_content",
        priority: isPriority(task.priority) ? task.priority : "normal",
      })) as WebsiteTask[];

      setTasks(loadedTasks);
      setSelectedTaskId(null);
      setErrorMessage(null);
      setIsLoadingTasks(false);
    }

    void loadTasks();
    return () => {
      isActive = false;
    };
  }, [currentClientId, isTeamProfileReady, teamProfile]);

  async function updateTaskStatus(
    taskId: string,
    columnStatus: ColumnStatus,
  ) {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) return false;
    if (task.column_status === columnStatus) return true;

    const previousStatus = task.column_status;
    setTasks((current) =>
      current.map((candidate) =>
        candidate.id === taskId
          ? { ...candidate, column_status: columnStatus }
          : candidate,
      ),
    );

    const { error } = await supabase
      .from("website_tasks")
      .update({ column_status: columnStatus })
      .eq("id", taskId);

    if (error) {
      setTasks((current) =>
        current.map((candidate) =>
          candidate.id === taskId
            ? { ...candidate, column_status: previousStatus }
            : candidate,
        ),
      );
      setErrorMessage(`Could not update the task status: ${error.message}`);
      return false;
    }

    setErrorMessage(null);
    if (columnStatus === "review") {
      void sendSlackNotification({
        type: "task_review",
        clientSlug: selectedClient,
        title: task.title,
      });
    }
    return true;
  }

  async function createTask(
    columnStatus: ColumnStatus,
    values: {
      title: string;
      description: string;
      priority: Priority;
    },
  ) {
    if (!currentClientId || !canManage) return false;

    const { data, error } = await supabase
      .from("website_tasks")
      .insert({
        client_id: currentClientId,
        title: values.title,
        description: values.description,
        column_status: columnStatus,
        priority: values.priority,
      })
      .select(
        "id, client_id, title, description, column_status, priority, live_url, created_at",
      )
      .single();

    if (error) {
      setErrorMessage(`Could not add the task: ${error.message}`);
      return false;
    }

    setTasks((current) => [...current, data as WebsiteTask]);
    setErrorMessage(null);
    return true;
  }

  async function updateTask(
    taskId: string,
    values: { title: string; description: string; priority: Priority },
  ) {
    if (!canManage) return false;
    const { error } = await supabase
      .from("website_tasks")
      .update(values)
      .eq("id", taskId);

    if (error) {
      setErrorMessage(`Could not update the task: ${error.message}`);
      return false;
    }

    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, ...values } : task,
      ),
    );
    setErrorMessage(null);
    return true;
  }

  async function updateLiveUrl(taskId: string, liveUrl: string | null) {
    if (!canManage) return false;
    const { error } = await supabase
      .from("website_tasks")
      .update({ live_url: liveUrl })
      .eq("id", taskId);

    if (error) {
      setErrorMessage(`Could not update the live URL: ${error.message}`);
      return false;
    }

    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, live_url: liveUrl } : task,
      ),
    );
    setErrorMessage(null);
    return true;
  }

  async function deleteTask(taskId: string) {
    if (!canManage) return;
    const { error } = await supabase
      .from("website_tasks")
      .delete()
      .eq("id", taskId);

    if (error) {
      setErrorMessage(`Could not delete the task: ${error.message}`);
      return;
    }

    setTasks((current) => current.filter((task) => task.id !== taskId));
    setSelectedTaskId(null);
    setErrorMessage(null);
  }

  return (
    <div className="min-h-screen bg-[#FFF9EF] text-[#341F60]">
      <header className="border-b border-[#E3D8EA] bg-white px-5 py-4 sm:px-8">
        <div className="mx-auto max-w-[1500px]">
          <UnderstoryBrand />
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 sm:py-11">
        <section className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7D4698]">
              Team · Digital projects
            </p>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#341F60] sm:text-4xl lg:text-[42px]">
              Website development
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#75647F]">
              Plan, review, and ship website work across client projects.
            </p>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8B7895] md:text-right">
              Client
            </p>
            <ClientSelect
              value={selectedClient}
              onChange={(value) => {
                const nextClient = value as ClientSlug;
                setSelectedClient(nextClient);
                projectTheme?.setClient(nextClient);
                setStatusFilter("all");
              }}
              options={clientOptions}
              ariaLabel="Select website client"
              disabled={isLoadingClients}
            />
          </div>
        </section>

        {errorMessage && (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-[#E4C88F] bg-[#FFF7E6] px-4 py-3 text-sm text-[#805A22]"
          >
            {errorMessage}
          </div>
        )}

        <section
          aria-label={`${WORKSPACE_CLIENTS[selectedClient].name} website status overview`}
          className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          {summaryMetrics.map((metric) => (
            <article
              key={metric.id}
              className="rounded-[20px] border border-[#E3D8EA] bg-white p-5 shadow-[0_5px_18px_rgba(52,31,96,0.04)]"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs font-semibold text-[#695677]">
                  {metric.label}
                </p>
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: metric.dot }}
                />
              </div>
              <p
                className="mt-4 text-3xl font-semibold tracking-[-0.04em]"
                style={{ color: metric.text }}
              >
                {isLoadingTasks
                  ? "—"
                  : metric.statuses.reduce(
                      (total, status) => total + statusCounts[status],
                      0,
                    )}
              </p>
            </article>
          ))}
        </section>

        <section
          aria-label={`${WORKSPACE_CLIENTS[selectedClient].name} website pages`}
          className="mt-8"
        >
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#341F60]">Pages</h2>
              <p className="mt-1 text-xs text-[#8B7895]">
                {WORKSPACE_CLIENTS[selectedClient].name} website work, ordered by date added.
              </p>
            </div>
            {canManage && (
            <button
              type="button"
              onClick={() => setAddTaskColumn("needs_content")}
              disabled={!currentClientId}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#7D4698] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#6A3A82] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Icon name="plus" className="size-3.5" />
              Add task
            </button>
            )}
          </div>

          <div
            aria-label="Filter pages by status"
            className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-[11px] font-semibold transition ${
                statusFilter === "all"
                  ? "border-[#7D4698] bg-[#7D4698] text-white"
                  : "border-[#DED0E7] bg-white text-[#695677] hover:bg-[#EEE3FA]"
              }`}
            >
              All · {tasks.length}
            </button>
            {columns.map((status) => (
              <button
                key={status.id}
                type="button"
                onClick={() => setStatusFilter(status.id)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-semibold transition ${
                  statusFilter === status.id
                    ? "border-[#7D4698] bg-[#EEE3FA] text-[#5F3378]"
                    : "border-[#DED0E7] bg-white text-[#695677] hover:bg-[#F7F1FB]"
                }`}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: status.dot }}
                />
                {status.label} · {statusCounts[status.id]}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-[22px] border border-[#E3D8EA] bg-white shadow-[0_7px_24px_rgba(52,31,96,0.05)]">
            {isLoadingTasks ? (
              <div className="divide-y divide-[#E9E0EF]">
                {Array.from({ length: 3 }, (_, index) => (
                  <div key={index} className="flex items-center gap-4 px-6 py-5">
                    <div className="min-w-0 flex-1">
                      <div className="h-4 w-52 max-w-full animate-pulse rounded bg-[#E9DFF1]" />
                      <div className="mt-2 h-3 w-36 animate-pulse rounded bg-[#F1E8F8]" />
                    </div>
                    <div className="h-7 w-28 animate-pulse rounded-full bg-[#F2EAFB]" />
                  </div>
                ))}
              </div>
            ) : filteredTasks.length > 0 ? (
              filteredTasks.map((task) => (
                <TaskListRow
                  key={task.id}
                  task={task}
                  onOpen={() => setSelectedTaskId(task.id)}
                />
              ))
            ) : (
              <div className="px-5 py-14 text-center">
                <p className="text-sm font-semibold text-[#5F4D70]">
                  {statusFilter === "all"
                    ? "No website pages yet."
                    : "No pages match this status."}
                </p>
                <p className="mt-1 text-xs text-[#8B7895]">
                  {statusFilter === "all"
                    ? `Add the first task for ${WORKSPACE_CLIENTS[selectedClient].name}.`
                    : "Choose another status or add a new task."}
                </p>
              </div>
            )}
          </div>
        </section>

        {requestedTaskId && <TaskItemsEditor taskId={requestedTaskId} />}

        <footer className="mt-6 flex flex-col gap-1 border-t border-[#E0D4E8] py-6 text-xs text-[#8B7895] sm:flex-row sm:justify-between">
          <p>Website development · Internal team workspace</p>
          <p>Changes are saved automatically.</p>
        </footer>
      </main>

      {canManage && addTaskColumn && (
        <AddTaskModal
          key={`${selectedClient}-${addTaskColumn}`}
          clientName={WORKSPACE_CLIENTS[selectedClient].name}
          column={
            columns.find((column) => column.id === addTaskColumn) ?? columns[0]
          }
          onClose={() => setAddTaskColumn(null)}
          onCreate={(values) => createTask(addTaskColumn, values)}
        />
      )}

      {selectedTask && (
        <TaskDetailPanel
          key={selectedTask.id}
          task={selectedTask}
          onClose={() => setSelectedTaskId(null)}
          onSave={(values) => updateTask(selectedTask.id, values)}
          onSaveLiveUrl={(liveUrl) => updateLiveUrl(selectedTask.id, liveUrl)}
          onChangeStatus={(status) =>
            updateTaskStatus(selectedTask.id, status)
          }
          onMarkReady={() =>
            updateTaskStatus(selectedTask.id, "needs_content")
          }
          onDelete={() => deleteTask(selectedTask.id)}
          canManage={canManage}
          actorName={teamProfile?.name ?? "Team member"}
        />
      )}

    </div>
  );
}

export default function WebsiteDevelopmentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FFF9EF] px-5 py-12 text-[#341F60]">
          <div className="mx-auto h-52 max-w-[1500px] animate-pulse rounded-[24px] border border-[#E3D8EA] bg-white" />
        </div>
      }
    >
      <WebsiteDevelopmentDashboard />
    </Suspense>
  );
}
