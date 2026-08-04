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
  created_at: string;
};

const TASK_ITEM_SELECT =
  "id, division_task_id, title, description, visual_url, completed, assignee_usernames, watcher_usernames, mentioned_usernames, created_at";

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

export function TaskItemsEditor({
  taskId,
  supportsVisuals = false,
}: {
  taskId: string;
  supportsVisuals?: boolean;
}) {
  const { accessLevel, isReady } = useTeamIdentity();
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

      <div className="mt-5 grid gap-3">
        {isLoading ? (
          <div className="h-28 animate-pulse rounded-2xl bg-[var(--muted)]" />
        ) : items.length ? (
          items.map((item) => {
            const watcherNames = item.watcher_usernames
              .map(teamNameForUsername)
              .filter((value): value is string => Boolean(value));
            return (
              <article key={item.id} className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
                <div
                  className={
                    supportsVisuals
                      ? "grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]"
                      : ""
                  }
                >
                  {supportsVisuals && <EventItemVisual item={item} />}
                  <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => void toggleCompleted(item)}
                    className="mt-1 size-4 accent-[var(--primary)]"
                    aria-label={`Mark ${item.title} complete`}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className={`text-sm font-semibold text-[var(--foreground)] ${item.completed ? "line-through opacity-60" : ""}`}>{item.title}</h3>
                    {item.description && <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[var(--muted-foreground)]">{item.description}</p>}
                    <p className="mt-2 text-[10px] text-[var(--muted-foreground)]">{watcherNames.join(" + ")} watching</p>
                  </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
                  <TaskPeopleButton
                    taskTitle={item.title}
                    assigneeUsernames={item.assignee_usernames}
                    members={members}
                    disabled={!isOwner}
                    onClick={() => openPeoplePicker(item)}
                  />
                  <div className="flex gap-3">
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
