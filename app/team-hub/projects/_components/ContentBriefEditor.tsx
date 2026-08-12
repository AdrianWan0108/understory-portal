"use client";

import { useState } from "react";
import {
  normalizeContentBriefData,
  type ContentBriefData,
} from "@/lib/division-tasks";
import { projectInputClass } from "@/lib/project-client-theme";
import { appendDivisionTaskMention } from "@/lib/project-mentions";
import { supabase } from "@/lib/supabase";
import type { WorkspaceClientSlug } from "@/lib/workspace-clients";
import { TeamButton } from "../../_components/TeamHubUi";
import { FilmingDetailsEditor } from "./FilmingDetailsEditor";
import { TaskMentionTextarea } from "./TaskMentionTextarea";
import { useTaskTeamMembers } from "./TaskPeoplePicker";

export function ContentBriefEditor({
  taskId,
  clientSlug,
  initialData,
  initialFilmingData,
}: {
  taskId: string;
  clientSlug: WorkspaceClientSlug;
  initialData: unknown;
  initialFilmingData: unknown;
}) {
  const teamMembers = useTaskTeamMembers();
  const [brief, setBrief] = useState<ContentBriefData>(() =>
    normalizeContentBriefData(initialData),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  function updateField<Key extends keyof ContentBriefData>(
    field: Key,
    value: ContentBriefData[Key],
  ) {
    setBrief((current) => ({ ...current, [field]: value }));
    setMessage(null);
  }

  async function saveBrief() {
    if (isSaving) return;
    setIsSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from("division_tasks")
      .update({
        content_brief_data: brief,
        due_date: brief.due_date || null,
      })
      .eq("id", taskId);
    setIsSaving(false);

    setMessage(
      error
        ? {
            tone: "error",
            text: `Could not save the content brief: ${error.message}`,
          }
        : { tone: "success", text: "Content brief saved." },
    );
  }

  return (
    <section className="mt-8 rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
            Template fields
          </p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--foreground)]">
            Content brief
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            Capture the strategic direction before content production starts.
          </p>
        </div>
        <TeamButton
          type="button"
          themed
          disabled={isSaving}
          onClick={() => void saveBrief()}
        >
          {isSaving ? "Saving…" : "Save brief"}
        </TeamButton>
      </div>

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            message.tone === "error"
              ? "border-[#E4B9B9] bg-[#FFF0F0] text-[#8B3E3E]"
              : "border-[#BFD8C7] bg-[#EDF7EF] text-[#356346]"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <label className="text-xs font-semibold text-[var(--foreground)]">
          Campaign goal
          <TaskMentionTextarea
            rows={4}
            value={brief.campaign_goal}
            onChange={(value) => updateField("campaign_goal", value)}
            members={teamMembers}
            onMention={(username) =>
              void appendDivisionTaskMention(taskId, username)
            }
            className={`mt-2 resize-y ${projectInputClass}`}
            placeholder="What should this campaign achieve?"
          />
        </label>
        <label className="text-xs font-semibold text-[var(--foreground)]">
          Target audience
          <TaskMentionTextarea
            rows={4}
            value={brief.target_audience}
            onChange={(value) => updateField("target_audience", value)}
            members={teamMembers}
            onMention={(username) =>
              void appendDivisionTaskMention(taskId, username)
            }
            className={`mt-2 resize-y ${projectInputClass}`}
            placeholder="Who are we trying to reach?"
          />
        </label>
        <label className="text-xs font-semibold text-[var(--foreground)]">
          Key messages
          <TaskMentionTextarea
            rows={6}
            value={brief.key_messages}
            onChange={(value) => updateField("key_messages", value)}
            members={teamMembers}
            onMention={(username) =>
              void appendDivisionTaskMention(taskId, username)
            }
            className={`mt-2 resize-y ${projectInputClass}`}
            placeholder="List the main messages, one per line."
          />
        </label>
        <label className="text-xs font-semibold text-[var(--foreground)]">
          Content pillars / themes
          <TaskMentionTextarea
            rows={6}
            value={brief.content_pillars}
            onChange={(value) => updateField("content_pillars", value)}
            members={teamMembers}
            onMention={(username) =>
              void appendDivisionTaskMention(taskId, username)
            }
            className={`mt-2 resize-y ${projectInputClass}`}
            placeholder="Education, community, product, behind the scenes…"
          />
        </label>
        <label className="text-xs font-semibold text-[var(--foreground)]">
          Due date
          <input
            type="date"
            value={brief.due_date}
            onChange={(event) => updateField("due_date", event.target.value)}
            className={`mt-2 ${projectInputClass}`}
          />
        </label>
      </div>

      <FilmingDetailsEditor
        taskId={taskId}
        clientSlug={clientSlug}
        initialData={initialFilmingData}
      />
    </section>
  );
}
