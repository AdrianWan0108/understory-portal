"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DIVISION_LABELS,
  DIVISION_TASK_STATUSES,
  DIVISION_TASK_STATUS_DETAILS,
  FIGJAM_DIVISIONS,
  isDivision,
  isDivisionTaskStatus,
  isDivisionTaskTemplate,
  specializedDivisionHref,
  type Division,
  type DivisionTaskStatus,
  type DivisionTaskTemplate,
} from "@/lib/division-tasks";
import { supabase } from "@/lib/supabase";
import {
  projectClientInitial,
  projectInputClass,
} from "@/lib/project-client-theme";
import {
  WORKSPACE_CLIENTS,
  isWorkspaceClientSlug,
  type WorkspaceClientSlug,
} from "@/lib/workspace-clients";
import { ContentBriefEditor } from "../_components/ContentBriefEditor";
import { FigJamTaskBoard } from "../_components/FigJamTaskBoard";
import { useProjectTheme } from "../_components/ProjectThemeProvider";
import { SocialResearchLog } from "../_components/SocialResearchLog";
import { TaskItemsEditor } from "../_components/TaskItemsEditor";
import {
  TaskMentionTextarea,
  extractMentionedUsernames,
} from "../_components/TaskMentionTextarea";
import { useTaskTeamMembers } from "../_components/TaskPeoplePicker";

type DivisionTask = {
  id: string;
  client_id: string;
  division: Division;
  title: string;
  description: string | null;
  status: DivisionTaskStatus;
  template_type: DivisionTaskTemplate;
  content_brief_data: unknown;
  filming_card_data: unknown;
  figjam_embed_url: string | null;
  watcher_usernames: string[];
  mentioned_usernames: string[];
  created_at: string;
};

export default function DivisionTaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const router = useRouter();
  const { setClient: setThemeClient } = useProjectTheme();
  const teamMembers = useTaskTeamMembers();
  const [task, setTask] = useState<DivisionTask | null>(null);
  const [clientSlug, setClientSlug] =
    useState<WorkspaceClientSlug | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadTask() {
      setIsLoading(true);
      setError(null);
      const { data, error: taskError } = await supabase
        .from("division_tasks")
        .select(
          "id, client_id, division, title, description, status, template_type, content_brief_data, filming_card_data, figjam_embed_url, watcher_usernames, mentioned_usernames, created_at",
        )
        .eq("id", taskId)
        .single();

      if (!isActive) return;
      if (
        taskError ||
        !data ||
        !isDivision(data.division) ||
        !isDivisionTaskStatus(data.status) ||
        !isDivisionTaskTemplate(data.template_type)
      ) {
        setError(
          `Could not load this task: ${
            taskError?.message ?? "Task data is invalid."
          }`,
        );
        setIsLoading(false);
        return;
      }

      const loadedTask = data as DivisionTask;
      const { data: clientRecord, error: clientError } = await supabase
        .from("clients")
        .select("slug")
        .eq("id", loadedTask.client_id)
        .single();

      if (!isActive) return;
      if (
        clientError ||
        !clientRecord ||
        !isWorkspaceClientSlug(clientRecord.slug)
      ) {
        setError(
          `Could not resolve this task's client: ${
            clientError?.message ?? "Client not found."
          }`,
        );
        setIsLoading(false);
        return;
      }

      const specializedHref = specializedDivisionHref(
        loadedTask.division,
        clientRecord.slug,
        loadedTask.id,
        loadedTask.template_type,
      );
      if (specializedHref) {
        router.replace(specializedHref);
        return;
      }

      setTask(loadedTask);
      setClientSlug(clientRecord.slug);
      setThemeClient(clientRecord.slug);
      setIsLoading(false);
    }

    void loadTask();
    return () => {
      isActive = false;
    };
  }, [router, setThemeClient, taskId]);

  async function updateStatus(status: DivisionTaskStatus) {
    if (!task || isSavingStatus) return;
    const previousStatus = task.status;
    setTask({ ...task, status });
    setIsSavingStatus(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("division_tasks")
      .update({ status })
      .eq("id", task.id);
    setIsSavingStatus(false);

    if (updateError) {
      setTask((current) =>
        current ? { ...current, status: previousStatus } : current,
      );
      setError(`Could not update the status: ${updateError.message}`);
    }
  }

  async function saveDescription() {
    if (!task || isSavingDescription) return;
    const description = descriptionDraft.trim() || null;
    const mentionedUsernames = extractMentionedUsernames(
      descriptionDraft,
      teamMembers,
    );
    const watcherUsernames = Array.from(
      new Set([...task.watcher_usernames, ...mentionedUsernames]),
    );
    setIsSavingDescription(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("division_tasks")
      .update({
        description,
        mentioned_usernames: mentionedUsernames,
        watcher_usernames: watcherUsernames,
      })
      .eq("id", task.id);
    setIsSavingDescription(false);

    if (updateError) {
      setError(`Could not update the description: ${updateError.message}`);
      return;
    }

    setTask({
      ...task,
      description,
      mentioned_usernames: mentionedUsernames,
      watcher_usernames: watcherUsernames,
    });
    setIsEditingDescription(false);
  }

  if (isLoading) {
    return (
      <main className="px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
        <div className="mx-auto max-w-5xl">
          <div className="h-80 animate-pulse rounded-[26px] border border-[var(--border)] bg-[var(--card)]" />
        </div>
      </main>
    );
  }

  if (!task || !clientSlug) {
    return (
      <main className="px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
        <div className="mx-auto max-w-5xl rounded-[24px] border border-[#E4B9B9] bg-[#FFF0F0] p-6 text-[#8B3E3E]">
          <p className="text-sm">{error ?? "Task not found."}</p>
          <Link
            href="/team-hub/projects"
            className="mt-4 inline-flex text-xs font-semibold underline"
          >
            Back to Projects
          </Link>
        </div>
      </main>
    );
  }

  const statusDetails = DIVISION_TASK_STATUS_DETAILS[task.status];
  const supportsFigJam = FIGJAM_DIVISIONS.includes(task.division);

  return (
    <main className="px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/team-hub/projects"
          className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--primary)] transition hover:brightness-75"
        >
          <span aria-hidden="true">←</span>
          Back to Projects
        </Link>

        <section className="mt-5 overflow-hidden rounded-[26px] border border-[var(--border)] bg-[var(--card)] shadow-[0_10px_34px_rgba(40,50,55,0.06)]">
          <div className="bg-[linear-gradient(135deg,var(--muted),var(--background),var(--accent))] p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)] shadow-sm"
                >
                  {projectClientInitial(clientSlug)}
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
                    {WORKSPACE_CLIENTS[clientSlug].name} ·{" "}
                    {DIVISION_LABELS[task.division]}
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                    {task.title}
                  </h1>
                  {isEditingDescription ? (
                    <div className="mt-4 max-w-3xl">
                      <TaskMentionTextarea
                        autoFocus
                        rows={5}
                        value={descriptionDraft}
                        onChange={setDescriptionDraft}
                        members={teamMembers}
                        placeholder="Describe the task. Type @ to mention someone."
                        className={`resize-y ${projectInputClass}`}
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isSavingDescription}
                          onClick={() => void saveDescription()}
                          className="rounded-full bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-[var(--primary-foreground)] disabled:opacity-50"
                        >
                          {isSavingDescription ? "Saving…" : "Save description"}
                        </button>
                        <button
                          type="button"
                          disabled={isSavingDescription}
                          onClick={() => setIsEditingDescription(false)}
                          className="rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-xs font-semibold text-[var(--foreground)] disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 max-w-3xl">
                      <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--muted-foreground)]">
                        {task.description || "No description has been added yet."}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setDescriptionDraft(task.description ?? "");
                          setIsEditingDescription(true);
                        }}
                        className="mt-2 text-xs font-semibold text-[var(--primary)] hover:underline"
                      >
                        Edit description or mention someone
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {task.template_type !== "analytics_results_hub" && (
                <span
                  className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${statusDetails.className}`}
                >
                  <span
                    className={`size-1.5 rounded-full ${statusDetails.dot}`}
                  />
                  {statusDetails.label}
                </span>
              )}
            </div>
          </div>

          {(task.template_type !== "analytics_results_hub" || error) && (
            <div className="p-6 sm:p-8">
              {task.template_type !== "analytics_results_hub" && (
                <>
                  <label className="block max-w-xs text-xs font-semibold text-[var(--foreground)]">
                    Status
                    <select
                      value={task.status}
                      disabled={isSavingStatus}
                      onChange={(event) =>
                        void updateStatus(
                          event.target.value as DivisionTaskStatus,
                        )
                      }
                      className={`mt-2 ${projectInputClass}`}
                    >
                      {DIVISION_TASK_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {DIVISION_TASK_STATUS_DETAILS[status].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {isSavingStatus && (
                    <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
                      Saving status…
                    </p>
                  )}
                </>
              )}
              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
                >
                  {error}
                </p>
              )}
            </div>
          )}
        </section>

        {task.template_type === "content_brief" && (
          <ContentBriefEditor
            key={task.id}
            taskId={task.id}
            clientSlug={clientSlug}
            initialData={task.content_brief_data}
            initialFilmingData={task.filming_card_data}
          />
        )}

        {task.template_type === "analytics_results_hub" && (
          <SocialResearchLog
            key={task.id}
            taskId={task.id}
            clientId={task.client_id}
          />
        )}

        {task.division !== "social-media" && (
          <TaskItemsEditor
            taskId={task.id}
            clientId={task.client_id}
            supportsVisuals={task.division === "event"}
          />
        )}

        {supportsFigJam && (
          <FigJamTaskBoard
            key={task.id}
            taskId={task.id}
            initialUrl={task.figjam_embed_url}
          />
        )}
      </div>
    </main>
  );
}
