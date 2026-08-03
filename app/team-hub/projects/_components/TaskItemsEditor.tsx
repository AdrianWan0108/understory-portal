"use client";

import { useEffect, useState } from "react";
import { useTeamIdentity } from "@/app/team-hub/_components/TeamIdentity";
import { TeamButton, TeamModal } from "@/app/team-hub/_components/TeamHubUi";
import { projectInputClass } from "@/lib/project-client-theme";
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
  completed: boolean;
  assignee_usernames: string[];
  watcher_usernames: string[];
  mentioned_usernames: string[];
  created_at: string;
};

export function TaskItemsEditor({ taskId }: { taskId: string }) {
  const { accessLevel, isReady } = useTeamIdentity();
  const isOwner = isReady && accessLevel === "owner";
  const members = useTaskTeamMembers();
  const [items, setItems] = useState<TaskItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemToEdit, setItemToEdit] = useState<TaskItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
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
        .select(
          "id, division_task_id, title, description, completed, assignee_usernames, watcher_usernames, mentioned_usernames, created_at",
        )
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
        mentioned_usernames: mentionedUsernames,
        watcher_usernames: Array.from(
          new Set([
            ...DEFAULT_TASK_WATCHER_USERNAMES,
            ...mentionedUsernames,
          ]),
        ),
      })
      .select(
        "id, division_task_id, title, description, completed, assignee_usernames, watcher_usernames, mentioned_usernames, created_at",
      )
      .single();
    setIsSaving(false);

    if (insertError || !data) {
      setError(`Could not add the item: ${insertError?.message ?? "No item returned."}`);
      return;
    }

    setItems((current) => [...current, data as TaskItem]);
    setTitle("");
    setDescription("");
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
    setError(null);
  }

  async function saveEdit() {
    if (!itemToEdit || !editTitle.trim() || isSaving) return;
    setIsSaving(true);
    const mentionedUsernames = extractMentionedUsernames(
      `${editTitle}\n${editDescription}`,
      members,
    );
    const values = {
      title: editTitle.trim(),
      description: editDescription.trim() || null,
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
          Add your own item names and descriptions. Nothing is pre-filled.
        </p>
      </div>

      <form onSubmit={addItem} className="mt-5 grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
        <label className="text-xs font-semibold text-[var(--foreground)]">
          Item
          <TaskMentionInput
            value={title}
            onChange={setTitle}
            members={members}
            placeholder="Type an item or @mention someone"
            className={`mt-2 ${projectInputClass}`}
          />
        </label>
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
          <TeamButton type="submit" themed disabled={isSaving || !title.trim()}>
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
        submitDisabled={!editTitle.trim()}
        themed
        onClose={() => setItemToEdit(null)}
        onSubmit={(event) => { event.preventDefault(); void saveEdit(); }}
      >
        <div className="grid gap-4">
          <label className="text-xs font-semibold text-[var(--foreground)]">
            Item
            <TaskMentionInput
              value={editTitle}
              onChange={setEditTitle}
              members={members}
              className={`mt-2 ${projectInputClass}`}
            />
          </label>
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
