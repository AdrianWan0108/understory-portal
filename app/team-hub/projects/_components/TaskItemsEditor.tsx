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
  completed: boolean;
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
  "id, division_task_id, title, description, visual_url, completed, assignee_usernames, watcher_usernames, mentioned_usernames, sent_to_client_at, sent_to_client_by, client_approvals, approval_history, created_at";

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

function EventItemVisual({ item }: { item: TaskItem }) {
  const [hasFailed, setHasFailed] = useState(false);
  const previewUrl = visualPreviewUrl(item.visual_url);

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--muted)]">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden">
        {previewUrl && !hasFailed ? (
          <img
            src={previewUrl}
            alt={`${item.title} visual`}
            className="size-full object-contain"
            onError={() => setHasFailed(true)}
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
              {item.visual_url ? "Preview unavailable" : "No visual attached"}
            </p>
          </div>
        )}
      </div>
      {item.visual_url && (
        <a
          href={item.visual_url}
          target="_blank"
          rel="noreferrer"
          className="block border-t border-[var(--border)] bg-[var(--card)] px-3 py-2 text-center text-[10px] font-semibold text-[var(--primary)] hover:underline"
        >
          Open in Google Drive ↗
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
  supportsVisuals = false,
}: {
  taskId: string;
  clientId?: string;
  supportsVisuals?: boolean;
}) {
  const { accessLevel, isReady, name: currentTeamMemberName } = useTeamIdentity();
  const isOwner = isReady && accessLevel === "owner";
  const members = useTaskTeamMembers();
  const [items, setItems] = useState<TaskItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visualLink, setVisualLink] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemToEdit, setItemToEdit] = useState<TaskItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editVisualLink, setEditVisualLink] = useState("");
  const [itemToAssign, setItemToAssign] = useState<TaskItem | null>(null);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [isSavingAssignees, setIsSavingAssignees] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [sendingItemId, setSendingItemId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

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
  }, [taskId]);

  async function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || isSaving) return;
    if (supportsVisuals && !isValidVisualLink(visualLink)) {
      setError("Add a valid Google Drive file link for the visual.");
      return;
    }
    setIsSaving(true);
    setError(null);

    const mentionedUsernames = extractMentionedUsernames(
      `${title}\n${description}`,
      members,
    );
    const { data, error: insertError } = await supabase
      .from("division_task_items")
      .insert({
        division_task_id: taskId,
        title: title.trim(),
        description: description.trim() || null,
        visual_url: supportsVisuals ? visualLink.trim() || null : null,
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
    setVisualLink("");
  }

  async function toggleCompleted(item: TaskItem) {
    const completed = !item.completed;
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id ? { ...candidate, completed } : candidate,
      ),
    );
    const { error: updateError } = await supabase
      .from("division_task_items")
      .update({ completed, updated_at: new Date().toISOString() })
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
    setEditVisualLink(item.visual_url ?? "");
    setError(null);
  }

  async function saveEdit() {
    if (!itemToEdit || !editTitle.trim() || isSaving) return;
    if (
      supportsVisuals &&
      !isValidVisualLink(editVisualLink)
    ) {
      setError("Add a valid Google Drive file link for the visual.");
      return;
    }
    setIsSaving(true);
    const mentionedUsernames = extractMentionedUsernames(
      `${editTitle}\n${editDescription}`,
      members,
    );
    const values = {
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      visual_url: supportsVisuals ? editVisualLink.trim() || null : null,
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
        updated_at: timestamp,
      })
      .eq("id", item.id)
      .eq("division_task_id", taskId);

    if (!sendError) {
      await supabase.from("client_approval_categories").upsert(
        {
          client_id: clientId,
          name: "Event",
          status: "approval_needed",
          description: "Event item ready for review",
          route_slug: "event",
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
            ? "Add each event item with a name, description, and optional Google Drive visual."
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
          <label className="text-xs font-semibold text-[var(--foreground)]">
            Google Drive visual link
            <input
              type="url"
              value={visualLink}
              onChange={(event) => {
                setVisualLink(event.target.value);
                if (error) setError(null);
              }}
              placeholder="Paste a shared Google Drive file link"
              className={`mt-2 ${projectInputClass}`}
            />
            <span className="mt-1.5 block text-[10px] font-normal leading-4 text-[var(--muted-foreground)]">
              Attach a flyer, mockup, floor plan, or other event visual.
            </span>
            {!isValidVisualLink(visualLink) && (
              <span className="mt-1.5 block text-[10px] font-semibold text-[#8B3E3E]">
                Use a valid shared Google Drive file link.
              </span>
            )}
          </label>
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
        <div className="flex justify-end">
          <TeamButton
            type="submit"
            themed
            disabled={
              isSaving ||
              !title.trim() ||
              (supportsVisuals && !isValidVisualLink(visualLink))
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
          (supportsVisuals && !isValidVisualLink(editVisualLink))
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
            <label className="text-xs font-semibold text-[var(--foreground)]">
              Google Drive visual link
              <input
                type="url"
                value={editVisualLink}
                onChange={(event) => {
                  setEditVisualLink(event.target.value);
                  if (error) setError(null);
                }}
                placeholder="Paste a shared Google Drive file link"
                className={`mt-2 ${projectInputClass}`}
              />
              {!isValidVisualLink(editVisualLink) && (
                <span className="mt-1.5 block text-[10px] font-semibold text-[#8B3E3E]">
                  Use a valid shared Google Drive file link.
                </span>
              )}
            </label>
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
