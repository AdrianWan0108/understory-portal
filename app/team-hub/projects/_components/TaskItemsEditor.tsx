"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useTeamIdentity } from "@/app/team-hub/_components/TeamIdentity";
import { TeamButton, TeamModal } from "@/app/team-hub/_components/TeamHubUi";
import { projectInputClass } from "@/lib/project-client-theme";
import {
  extractGoogleDriveFileId,
  resolveGoogleDriveFileUrls,
} from "@/lib/google-drive";
import {
  DEFAULT_TASK_WATCHER_USERNAMES,
  teamNameForUsername,
} from "@/lib/team-assignments";
import { supabase } from "@/lib/supabase";
import {
  DIVISION_TASK_STATUSES,
  DIVISION_TASK_STATUS_DETAILS,
  type DivisionTaskStatus,
} from "@/lib/division-tasks";
import {
  TaskPeopleButton,
  TaskPeopleModal,
  useTaskTeamMembers,
} from "./TaskPeoplePicker";
import {
  TaskMentionInput,
  TaskMentionTextarea,
  extractMentionedUsernames,
} from "./TaskMentionTextarea";

type TaskItem = {
  id: string;
  division_task_id: string;
  title: string;
  description: string | null;
  visual_url: string | null;
  visual_urls: string[];
  completed: boolean;
  status: DivisionTaskStatus;
  start_date: string | null;
  due_date: string | null;
  assignee_usernames: string[];
  watcher_usernames: string[];
  mentioned_usernames: string[];
  sent_to_client_at: string | null;
  sent_to_client_by: string | null;
  client_approvals: unknown;
  approval_history: unknown;
  created_at: string;
};

const TASK_ITEM_SELECT =
  "id, division_task_id, title, description, visual_url, visual_urls, completed, status, start_date, due_date, assignee_usernames, watcher_usernames, mentioned_usernames, sent_to_client_at, sent_to_client_by, client_approvals, approval_history, created_at";

function visualPreviewUrl(value: string | null) {
  if (!value) return null;
  const fileId = extractGoogleDriveFileId(value);
  return fileId
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1000`
    : null;
}

function isValidVisualLink(value: string) {
  return !value.trim() || Boolean(resolveGoogleDriveFileUrls(value));
}

function normalizedVisualLinks(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function itemVisualLinks(item: TaskItem) {
  const links = normalizedVisualLinks(item.visual_urls ?? []);
  return links.length > 0
    ? links
    : item.visual_url
      ? [item.visual_url]
      : [];
}

function areValidVisualLinks(values: string[]) {
  return values.every(isValidVisualLink);
}

function formatItemDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function GoogleDriveVisualFields({
  values,
  onChange,
  idPrefix,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  idPrefix: string;
}) {
  function updateLink(index: number, value: string) {
    onChange(
      values.map((currentValue, currentIndex) =>
        currentIndex === index ? value : currentValue,
      ),
    );
  }

  function removeLink(index: number) {
    const nextValues = values.filter((_, currentIndex) => currentIndex !== index);
    onChange(nextValues.length > 0 ? nextValues : [""]);
  }

  return (
    <fieldset className="grid gap-2">
      <legend className="text-xs font-semibold text-[var(--foreground)]">
        Google Drive visual links
      </legend>
      {values.map((value, index) => (
        <div key={index} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={`${idPrefix}-${index}`} className="sr-only">
              Google Drive visual link {index + 1}
            </label>
            <input
              id={`${idPrefix}-${index}`}
              type="url"
              value={value}
              onChange={(event) => updateLink(index, event.target.value)}
              placeholder="Paste a shared Google Drive file link"
              aria-invalid={!isValidVisualLink(value)}
              className={projectInputClass}
            />
            {!isValidVisualLink(value) && (
              <span className="mt-1.5 block text-[10px] font-semibold text-[#8B3E3E]">
                Use a valid shared Google Drive file link.
              </span>
            )}
          </div>
          {values.length > 1 && (
            <button
              type="button"
              onClick={() => removeLink(index)}
              className="mt-2 shrink-0 text-[11px] font-semibold text-[#9A4040] hover:underline"
              aria-label={`Remove Google Drive visual link ${index + 1}`}
            >
              Remove
            </button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-normal leading-4 text-[var(--muted-foreground)]">
          Add one or more flyers, mockups, floor plans, or other visuals.
        </span>
        <button
          type="button"
          onClick={() => onChange([...values, ""])}
          className="text-[11px] font-semibold text-[var(--primary)] hover:underline"
        >
          + Add another link
        </button>
      </div>
    </fieldset>
  );
}

function EventItemVisual({ item }: { item: TaskItem }) {
  const links = itemVisualLinks(item);
  const [activeVisual, setActiveVisual] = useState(0);
  const [failedVisuals, setFailedVisuals] = useState<number[]>([]);
  const activeIndex = Math.min(activeVisual, Math.max(links.length - 1, 0));
  const activeLink = links[activeIndex] ?? null;
  const previewUrl = visualPreviewUrl(activeLink);
  const hasFailed = failedVisuals.includes(activeIndex);

  function showVisual(index: number) {
    setActiveVisual(Math.max(0, Math.min(index, links.length - 1)));
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--muted)]">
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden">
        {previewUrl && !hasFailed ? (
          <img
            src={previewUrl}
            alt={`${item.title} visual`}
            className="size-full object-contain"
            onError={() =>
              setFailedVisuals((current) =>
                current.includes(activeIndex)
                  ? current
                  : [...current, activeIndex],
              )
            }
          />
        ) : (
          <div className="px-4 text-center">
            <span className="mx-auto flex size-9 items-center justify-center rounded-xl bg-[var(--card)] text-[var(--primary)]">
              <svg
                aria-hidden="true"
                className="size-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="m5 16 4-4 3 3 2-2 5 5M8 9h.01" />
              </svg>
            </span>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              {activeLink ? "Preview unavailable" : "No visual attached"}
            </p>
          </div>
        )}
        {links.length > 1 && (
          <>
            <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[9px] font-semibold text-white">
              {activeIndex + 1} of {links.length}
            </span>
            <button
              type="button"
              disabled={activeIndex === 0}
              onClick={() => showVisual(activeIndex - 1)}
              aria-label="Show previous visual"
              className="absolute left-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg text-[#241936] shadow disabled:opacity-35"
            >
              ‹
            </button>
            <button
              type="button"
              disabled={activeIndex === links.length - 1}
              onClick={() => showVisual(activeIndex + 1)}
              aria-label="Show next visual"
              className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg text-[#241936] shadow disabled:opacity-35"
            >
              ›
            </button>
          </>
        )}
      </div>
      {activeLink && (
        <a
          href={activeLink}
          target="_blank"
          rel="noreferrer"
          className="block border-t border-[var(--border)] bg-[var(--card)] px-3 py-2 text-center text-[10px] font-semibold text-[var(--primary)] hover:underline"
        >
          Open visual {links.length > 1 ? activeIndex + 1 : ""} in Google Drive ↗
        </a>
      )}
    </div>
  );
}

function clientDecision(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "pending" as const;
  }

  const statuses = Object.values(value).flatMap((decision) => {
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
      return [];
    }
    const status = (decision as Record<string, unknown>).status;
    return status === "approved" || status === "changes" ? [status] : [];
  });

  if (statuses.includes("changes")) return "changes" as const;
  if (statuses.length > 0 && statuses.every((status) => status === "approved")) {
    return "approved" as const;
  }
  return "pending" as const;
}

function WatcherAvatars({
  usernames,
  members,
}: {
  usernames: string[];
  members: ReturnType<typeof useTaskTeamMembers>;
}) {
  const watchers = usernames.map((username) => {
    const member = members.find(
      (candidate) => candidate.team_username === username,
    );
    return {
      username,
      name: member?.full_name ?? teamNameForUsername(username) ?? username,
      avatarUrl: member?.avatar_url ?? null,
    };
  });

  return (
    <div className="flex shrink-0 items-center gap-2" aria-label={`Watching: ${watchers.map((watcher) => watcher.name).join(", ")}`}>
      <span className="text-[10px] font-semibold text-[var(--muted-foreground)]">
        Watching:
      </span>
      <span className="flex -space-x-1.5" aria-hidden="true">
        {watchers.map((watcher) =>
          watcher.avatarUrl ? (
            <img
              key={watcher.username}
              src={watcher.avatarUrl}
              alt=""
              className="size-6 rounded-full border-2 border-[var(--background)] object-cover"
            />
          ) : (
            <span
              key={watcher.username}
              title={watcher.name}
              className="flex size-6 items-center justify-center rounded-full border-2 border-[var(--background)] bg-[var(--primary)] text-[8px] font-bold text-[var(--primary-foreground)]"
            >
              {watcher.name.trim().charAt(0).toUpperCase() || "?"}
            </span>
          ),
        )}
      </span>
    </div>
  );
}

export function TaskItemsEditor({
  taskId,
  clientId,
  deliverableCategory,
}: {
  taskId: string;
  clientId?: string;
  deliverableCategory?: "event" | "branding";
}) {
  const supportsVisuals = Boolean(deliverableCategory);
  const { accessLevel, isReady, name: currentTeamMemberName } = useTeamIdentity();
  const isOwner = isReady && accessLevel === "owner";
  const members = useTaskTeamMembers();
  const [items, setItems] = useState<TaskItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<DivisionTaskStatus>("planning");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [visualLinks, setVisualLinks] = useState([""]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemToEdit, setItemToEdit] = useState<TaskItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] =
    useState<DivisionTaskStatus>("planning");
  const [editStartDate, setEditStartDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editVisualLinks, setEditVisualLinks] = useState([""]);
  const [itemToAssign, setItemToAssign] = useState<TaskItem | null>(null);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [isSavingAssignees, setIsSavingAssignees] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [sendingItemId, setSendingItemId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [syncRevision, setSyncRevision] = useState(0);

  useEffect(() => {
    const channel = supabase
      .channel(`task-items-${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "division_task_items",
          filter: `division_task_id=eq.${taskId}`,
        },
        () => setSyncRevision((current) => current + 1),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [taskId]);

  useEffect(() => {
    let isActive = true;

    async function loadItems() {
      setIsLoading(true);
      const { data, error: loadError } = await supabase
        .from("division_task_items")
        .select(TASK_ITEM_SELECT)
        .eq("division_task_id", taskId)
        .order("created_at", { ascending: true });

      if (!isActive) return;
      if (loadError) {
        setError(`Could not load task items: ${loadError.message}`);
      } else {
        setItems((data ?? []) as TaskItem[]);
      }
      setIsLoading(false);
    }

    void loadItems();
    return () => {
      isActive = false;
    };
  }, [syncRevision, taskId]);

  async function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || isSaving) return;
    if (startDate && dueDate && startDate > dueDate) {
      setError("The item start date must be on or before its deadline.");
      return;
    }
    if (supportsVisuals && !areValidVisualLinks(visualLinks)) {
      setError("Add valid Google Drive file links for the visuals.");
      return;
    }
    setIsSaving(true);
    setError(null);

    const mentionedUsernames = extractMentionedUsernames(
      `${title}\n${description}`,
      members,
    );
    const savedVisualLinks = normalizedVisualLinks(visualLinks);
    const { data, error: insertError } = await supabase
      .from("division_task_items")
      .insert({
        division_task_id: taskId,
        title: title.trim(),
        description: description.trim() || null,
        status,
        completed: status === "approved",
        start_date: startDate || null,
        due_date: dueDate || null,
        visual_url: supportsVisuals ? savedVisualLinks[0] ?? null : null,
        visual_urls: supportsVisuals ? savedVisualLinks : [],
        mentioned_usernames: mentionedUsernames,
        watcher_usernames: Array.from(
          new Set([
            ...DEFAULT_TASK_WATCHER_USERNAMES,
            ...mentionedUsernames,
          ]),
        ),
      })
      .select(TASK_ITEM_SELECT)
      .single();
    setIsSaving(false);

    if (insertError || !data) {
      setError(`Could not add the item: ${insertError?.message ?? "No item returned."}`);
      return;
    }

    setItems((current) => [...current, data as TaskItem]);
    setTitle("");
    setDescription("");
    setStatus("planning");
    setStartDate("");
    setDueDate("");
    setVisualLinks([""]);
  }

  async function toggleCompleted(item: TaskItem) {
    const completed = !item.completed;
    const status = completed
      ? "approved"
      : item.status === "approved"
        ? "production"
        : item.status;
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id
          ? { ...candidate, completed, status }
          : candidate,
      ),
    );
    const { error: updateError } = await supabase
      .from("division_task_items")
      .update({ completed, status, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (updateError) {
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === item.id ? item : candidate,
        ),
      );
      setError(`Could not update the item: ${updateError.message}`);
    }
  }

  function openEditor(item: TaskItem) {
    setItemToEdit(item);
    setEditTitle(item.title);
    setEditDescription(item.description ?? "");
    setEditStatus(item.status);
    setEditStartDate(item.start_date ?? "");
    setEditDueDate(item.due_date ?? "");
    const links = itemVisualLinks(item);
    setEditVisualLinks(links.length > 0 ? links : [""]);
    setError(null);
  }

  async function saveEdit() {
    if (!itemToEdit || !editTitle.trim() || isSaving) return;
    if (editStartDate && editDueDate && editStartDate > editDueDate) {
      setError("The item start date must be on or before its deadline.");
      return;
    }
    if (
      supportsVisuals &&
      !areValidVisualLinks(editVisualLinks)
    ) {
      setError("Add valid Google Drive file links for the visuals.");
      return;
    }
    setIsSaving(true);
    const mentionedUsernames = extractMentionedUsernames(
      `${editTitle}\n${editDescription}`,
      members,
    );
    const savedVisualLinks = normalizedVisualLinks(editVisualLinks);
    const values = {
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      status: editStatus,
      completed: editStatus === "approved",
      start_date: editStartDate || null,
      due_date: editDueDate || null,
      visual_url: supportsVisuals ? savedVisualLinks[0] ?? null : null,
      visual_urls: supportsVisuals ? savedVisualLinks : [],
      mentioned_usernames: mentionedUsernames,
      watcher_usernames: Array.from(
        new Set([
          ...itemToEdit.watcher_usernames,
          ...mentionedUsernames,
        ]),
      ),
      updated_at: new Date().toISOString(),
    };
    const { error: updateError } = await supabase
      .from("division_task_items")
      .update(values)
      .eq("id", itemToEdit.id);
    setIsSaving(false);

    if (updateError) {
      setError(`Could not save the item: ${updateError.message}`);
      return;
    }
    setItems((current) =>
      current.map((item) =>
        item.id === itemToEdit.id ? { ...item, ...values } : item,
      ),
    );
    setItemToEdit(null);
  }

  async function deleteItem(item: TaskItem) {
    if (!isOwner) return;
    const { error: deleteError } = await supabase
      .from("division_task_items")
      .delete()
      .eq("id", item.id);
    if (deleteError) {
      setError(`Could not delete the item: ${deleteError.message}`);
      return;
    }
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
  }

  function openPeoplePicker(item: TaskItem) {
    if (!isOwner) return;
    setItemToAssign(item);
    setSelectedAssignees(item.assignee_usernames);
    setAssignmentError(null);
  }

  function closePeoplePicker() {
    if (isSavingAssignees) return;
    setItemToAssign(null);
    setSelectedAssignees([]);
    setAssignmentError(null);
  }

  function toggleAssignee(username: string) {
    setSelectedAssignees((current) =>
      current.includes(username)
        ? current.filter((candidate) => candidate !== username)
        : [...current, username],
    );
  }

  async function saveAssignees() {
    if (!isOwner || !itemToAssign || isSavingAssignees) return;
    setIsSavingAssignees(true);
    const { error: updateError } = await supabase
      .from("division_task_items")
      .update({
        assignee_usernames: selectedAssignees,
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemToAssign.id);
    setIsSavingAssignees(false);

    if (updateError) {
      setAssignmentError(`Could not save people: ${updateError.message}`);
      return;
    }
    setItems((current) =>
      current.map((item) =>
        item.id === itemToAssign.id
          ? { ...item, assignee_usernames: selectedAssignees }
          : item,
      ),
    );
    closePeoplePicker();
  }

  async function sendToClient(item: TaskItem) {
    if (
      !supportsVisuals ||
      !deliverableCategory ||
      !clientId ||
      !isOwner ||
      !currentTeamMemberName ||
      sendingItemId
    ) {
      return;
    }

    const decision = clientDecision(item.client_approvals);
    if (item.sent_to_client_at && decision !== "changes") return;

    const timestamp = new Date().toISOString();
    setSendingItemId(item.id);
    setError(null);
    setFeedback(null);
    const { error: sendError } = await supabase
      .from("division_task_items")
      .update({
        sent_to_client_at: timestamp,
        sent_to_client_by: currentTeamMemberName,
        client_approvals: {},
        status: "review",
        completed: false,
        updated_at: timestamp,
      })
      .eq("id", item.id)
      .eq("division_task_id", taskId);

    if (!sendError) {
      const categoryName =
        deliverableCategory === "branding" ? "Branding" : "Event";
      await supabase.from("client_approval_categories").upsert(
        {
          client_id: clientId,
          name: categoryName,
          status: "approval_needed",
          description: `${categoryName} item ready for review`,
          route_slug: deliverableCategory,
        },
        { onConflict: "client_id,route_slug" },
      );
    }
    setSendingItemId(null);

    if (sendError) {
      setError(`Could not send this item to the client: ${sendError.message}`);
      return;
    }

    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              sent_to_client_at: timestamp,
              sent_to_client_by: currentTeamMemberName,
              client_approvals: {},
              status: "review",
              completed: false,
            }
          : candidate,
      ),
    );
    setFeedback(
      `${item.title} was ${item.sent_to_client_at ? "resent" : "sent"} to the client for approval.`,
    );
  }

  return (
    <section className="mt-8 rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
          Work breakdown
        </p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--foreground)]">
          Task items
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          {supportsVisuals
            ? `Add each ${deliverableCategory} item with a name, description, and optional Google Drive visuals.`
            : "Add your own item names and descriptions. Nothing is pre-filled."}
        </p>
      </div>

      <form onSubmit={addItem} className="mt-5 grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
        <label className="text-xs font-semibold text-[var(--foreground)]">
          {supportsVisuals ? "Item name" : "Item"}
          <TaskMentionInput
            value={title}
            onChange={setTitle}
            members={members}
            placeholder="Type an item or @mention someone"
            className={`mt-2 ${projectInputClass}`}
          />
        </label>
        {supportsVisuals && (
          <GoogleDriveVisualFields
            idPrefix="new-google-drive-visual"
            values={visualLinks}
            onChange={(values) => {
              setVisualLinks(values);
              if (error) setError(null);
            }}
          />
        )}
        <label className="text-xs font-semibold text-[var(--foreground)]">
          Description
          <TaskMentionTextarea
            rows={3}
            value={description}
            onChange={setDescription}
            members={members}
            placeholder="Describe what needs to be done. Type @ to mention someone."
            className={`mt-2 resize-y ${projectInputClass}`}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-[var(--foreground)]">
            Status
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as DivisionTaskStatus)
              }
              className={`mt-2 ${projectInputClass}`}
            >
              {DIVISION_TASK_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {DIVISION_TASK_STATUS_DETAILS[option].label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--foreground)]">
            Start date
            <input
              type="date"
              value={startDate}
              max={dueDate || undefined}
              onChange={(event) => setStartDate(event.target.value)}
              className={`mt-2 ${projectInputClass}`}
            />
          </label>
          <label className="text-xs font-semibold text-[var(--foreground)]">
            Deadline
            <input
              type="date"
              value={dueDate}
              min={startDate || undefined}
              onChange={(event) => setDueDate(event.target.value)}
              className={`mt-2 ${projectInputClass}`}
            />
          </label>
        </div>
        <div className="flex justify-end">
          <TeamButton
            type="submit"
            themed
            disabled={
              isSaving ||
              !title.trim() ||
              (supportsVisuals && !areValidVisualLinks(visualLinks))
            }
          >
            {isSaving ? "Adding…" : "+ Add item"}
          </TeamButton>
        </div>
      </form>

      {error && <p role="alert" className="mt-4 rounded-xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]">{error}</p>}
      {feedback && <p role="status" className="mt-4 rounded-xl border border-[#BFD8C7] bg-[#EAF5ED] px-4 py-3 text-sm text-[#356346]">{feedback}</p>}

      <div
        className={`mt-5 grid gap-4 ${supportsVisuals ? "md:grid-cols-2" : ""}`}
      >
        {isLoading ? (
          <div className="h-28 animate-pulse rounded-2xl bg-[var(--muted)]" />
        ) : items.length ? (
          items.map((item) => {
            const watcherNames = item.watcher_usernames
              .map(teamNameForUsername)
              .filter((value): value is string => Boolean(value));
            const decision = clientDecision(item.client_approvals);
            const statusDetails = DIVISION_TASK_STATUS_DETAILS[item.status];
            return (
              <article
                key={item.id}
                className={`rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 ${
                  supportsVisuals ? "flex h-full flex-col" : ""
                }`}
              >
                <div className={supportsVisuals ? "flex flex-1 flex-col gap-4" : ""}>
                  {supportsVisuals && <EventItemVisual item={item} />}
                  <div className="flex items-start gap-3">
                  {!supportsVisuals && (
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => void toggleCompleted(item)}
                      className="mt-1 size-4 accent-[var(--primary)]"
                      aria-label={`Mark ${item.title} complete`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className={`text-sm font-semibold text-[var(--foreground)] ${!supportsVisuals && item.completed ? "line-through opacity-60" : ""}`}>{item.title}</h3>
                      {supportsVisuals && (
                        <WatcherAvatars
                          usernames={item.watcher_usernames}
                          members={members}
                        />
                      )}
                    </div>
                    {item.description && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[var(--muted-foreground)]">{item.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.07em] ${statusDetails.className}`}>
                        {statusDetails.label}
                      </span>
                      {(item.start_date || item.due_date) && (
                        <span className="text-[10px] font-semibold text-[var(--muted-foreground)]">
                          {item.start_date
                            ? formatItemDate(item.start_date)
                            : "Start TBD"}
                          {" → "}
                          {item.due_date
                            ? formatItemDate(item.due_date)
                            : "Deadline TBD"}
                        </span>
                      )}
                    </div>
                    {!supportsVisuals && <p className="mt-2 text-[10px] text-[var(--muted-foreground)]">{watcherNames.join(" + ")} watching</p>}
                  </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                  <TaskPeopleButton
                    taskTitle={item.title}
                    assigneeUsernames={item.assignee_usernames}
                    members={members}
                    disabled={!isOwner}
                    onClick={() => openPeoplePicker(item)}
                  />
                  <div className="flex gap-3">
                    {supportsVisuals && isOwner && (
                      <button
                        type="button"
                        disabled={
                          sendingItemId === item.id ||
                          Boolean(item.sent_to_client_at && decision !== "changes")
                        }
                        onClick={() => void sendToClient(item)}
                        className="rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-[var(--primary-foreground)] transition hover:brightness-90 disabled:cursor-default disabled:opacity-55"
                      >
                        {sendingItemId === item.id
                          ? "Sending…"
                          : decision === "changes"
                            ? "Resend to client"
                            : decision === "approved"
                              ? "Approved by client"
                              : item.sent_to_client_at
                                ? "Sent to client"
                                : "Send to client"}
                      </button>
                    )}
                    <button type="button" onClick={() => openEditor(item)} className="text-xs font-semibold text-[var(--primary)]">Edit</button>
                    {isOwner && <button type="button" onClick={() => void deleteItem(item)} className="text-xs font-semibold text-[#9A4040]">Delete</button>}
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <p className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-xs text-[var(--muted-foreground)]">No items yet. Add the first one above.</p>
        )}
      </div>

      <TeamModal
        open={Boolean(itemToEdit)}
        title="Edit task item"
        submitLabel="Save item"
        isSaving={isSaving}
        submitDisabled={
          !editTitle.trim() ||
          (supportsVisuals && !areValidVisualLinks(editVisualLinks))
        }
        themed
        onClose={() => setItemToEdit(null)}
        onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}
      >
        <div className="grid gap-4">
          <label className="text-xs font-semibold text-[var(--foreground)]">
            {supportsVisuals ? "Item name" : "Item"}
            <TaskMentionInput
              value={editTitle}
              onChange={setEditTitle}
              members={members}
              className={`mt-2 ${projectInputClass}`}
            />
          </label>
          {supportsVisuals && (
            <GoogleDriveVisualFields
              idPrefix="edit-google-drive-visual"
              values={editVisualLinks}
              onChange={(values) => {
                setEditVisualLinks(values);
                if (error) setError(null);
              }}
            />
          )}
          <label className="text-xs font-semibold text-[var(--foreground)]">
            Description
            <TaskMentionTextarea
              rows={4}
              value={editDescription}
              onChange={setEditDescription}
              members={members}
              placeholder="Type @ to mention someone."
              className={`mt-2 resize-y ${projectInputClass}`}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-xs font-semibold text-[var(--foreground)]">
              Status
              <select
                value={editStatus}
                onChange={(event) =>
                  setEditStatus(event.target.value as DivisionTaskStatus)
                }
                className={`mt-2 ${projectInputClass}`}
              >
                {DIVISION_TASK_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {DIVISION_TASK_STATUS_DETAILS[option].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-[var(--foreground)]">
              Start date
              <input
                type="date"
                value={editStartDate}
                max={editDueDate || undefined}
                onChange={(event) => setEditStartDate(event.target.value)}
                className={`mt-2 ${projectInputClass}`}
              />
            </label>
            <label className="text-xs font-semibold text-[var(--foreground)]">
              Deadline
              <input
                type="date"
                value={editDueDate}
                min={editStartDate || undefined}
                onChange={(event) => setEditDueDate(event.target.value)}
                className={`mt-2 ${projectInputClass}`}
              />
            </label>
          </div>
        </div>
      </TeamModal>

      <TaskPeopleModal
        open={Boolean(itemToAssign)}
        taskTitle={itemToAssign?.title ?? ""}
        members={members}
        selectedUsernames={selectedAssignees}
        isSaving={isSavingAssignees}
        error={assignmentError}
        onToggle={toggleAssignee}
        onClose={closePeoplePicker}
        onSave={() => void saveAssignees()}
      />
    </section>
  );
}
