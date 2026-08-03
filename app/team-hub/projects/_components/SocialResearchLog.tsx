"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTeamIdentity } from "@/app/team-hub/_components/TeamIdentity";
import { EMPTY_CONTENT_BRIEF_DATA } from "@/lib/division-tasks";
import {
  SOCIAL_CONTENT_TYPES,
  SOCIAL_CONTENT_TYPE_LABELS,
  SOCIAL_HOOK_TYPES,
  SOCIAL_HOOK_TYPE_LABELS,
  SOCIAL_POST_FORMATS,
  SOCIAL_POST_FORMAT_LABELS,
  resolveInstagramEmbedUrl,
  type SocialContentType,
  type SocialHookType,
  type SocialPostFormat,
  type SocialResearchEntry,
} from "@/lib/social-content";
import { projectInputClass } from "@/lib/project-client-theme";
import { appendDivisionTaskMention } from "@/lib/project-mentions";
import { supabase } from "@/lib/supabase";
import { TeamButton, TeamModal } from "../../_components/TeamHubUi";
import {
  TaskMentionInput,
  TaskMentionTextarea,
} from "./TaskMentionTextarea";
import { useTaskTeamMembers } from "./TaskPeoplePicker";

type ResearchDraft = {
  reference_link: string;
  format: SocialPostFormat;
  hook: string;
  storytelling_approach: string;
  used_trending_audio: boolean;
  audio_name: string;
  views: string;
  engagement_rate: string;
  hook_types: SocialHookType[];
  hook_explanation: string;
  content_type: SocialContentType | "";
  why_it_worked: string;
  cta: string;
};

const EMPTY_DRAFT: ResearchDraft = {
  reference_link: "",
  format: "reel",
  hook: "",
  storytelling_approach: "",
  used_trending_audio: false,
  audio_name: "",
  views: "",
  engagement_rate: "",
  hook_types: [],
  hook_explanation: "",
  content_type: "",
  why_it_worked: "",
  cta: "",
};

function toDraft(entry: SocialResearchEntry): ResearchDraft {
  return {
    reference_link: entry.reference_link,
    format: entry.format,
    hook: entry.hook,
    storytelling_approach: entry.storytelling_approach,
    used_trending_audio: entry.used_trending_audio,
    audio_name: entry.audio_name ?? "",
    views: entry.views === null ? "" : String(entry.views),
    engagement_rate:
      entry.engagement_rate === null ? "" : String(entry.engagement_rate),
    hook_types: entry.hook_types,
    hook_explanation: entry.hook_explanation,
    content_type: entry.content_type ?? "",
    why_it_worked: entry.why_it_worked,
    cta: entry.cta ?? "",
  };
}

function normalizeEntry(entry: SocialResearchEntry): SocialResearchEntry {
  return {
    ...entry,
    hook: entry.hook ?? "",
    storytelling_approach: entry.storytelling_approach ?? "",
    audio_name: entry.audio_name ?? null,
    views: entry.views === null ? null : Number(entry.views),
    engagement_rate:
      entry.engagement_rate === null ? null : Number(entry.engagement_rate),
    hook_types: entry.hook_types ?? [],
    hook_explanation: entry.hook_explanation ?? "",
    content_type: entry.content_type ?? null,
    why_it_worked: entry.why_it_worked ?? "",
    cta: entry.cta ?? null,
  };
}

function formatViews(value: number | null) {
  if (value === null) return "Not recorded";
  return new Intl.NumberFormat("en-CA").format(value);
}

function entryTitle(entry: SocialResearchEntry) {
  if (entry.hook.trim()) return entry.hook.trim().slice(0, 72);
  if (entry.storytelling_approach.trim()) {
    return entry.storytelling_approach.trim().slice(0, 72);
  }
  return `${SOCIAL_POST_FORMAT_LABELS[entry.format]} concept`;
}

export function SocialResearchLog({
  taskId,
  clientId,
}: {
  taskId: string;
  clientId: string;
}) {
  const router = useRouter();
  const teamMembers = useTaskTeamMembers();
  const { accessLevel } = useTeamIdentity();
  const isOwner = accessLevel === "owner";
  const [entries, setEntries] = useState<SocialResearchEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ResearchDraft>(EMPTY_DRAFT);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [planningEntryId, setPlanningEntryId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failedEmbeds, setFailedEmbeds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let isActive = true;

    async function loadEntries() {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("social_research_entries")
        .select(
          "id, division_task_id, reference_link, format, hook, storytelling_approach, used_trending_audio, audio_name, views, engagement_rate, hook_types, hook_explanation, content_type, why_it_worked, cta, created_at",
        )
        .eq("division_task_id", taskId)
        .order("created_at", { ascending: false });

      if (!isActive) return;
      if (error) {
        setMessage(`Could not load the research log: ${error.message}`);
        setEntries([]);
      } else {
        setEntries(
          ((data ?? []) as SocialResearchEntry[]).map(normalizeEntry),
        );
        setMessage(null);
      }
      setIsLoading(false);
    }

    void loadEntries();
    return () => {
      isActive = false;
    };
  }, [taskId]);

  function openNewEntry() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setMessage(null);
    setIsEditorOpen(true);
  }

  function openEntry(entry: SocialResearchEntry) {
    setEditingId(entry.id);
    setDraft(toDraft(entry));
    setMessage(null);
    setIsEditorOpen(true);
  }

  function toggleHookType(hookType: SocialHookType) {
    setDraft((current) => ({
      ...current,
      hook_types: current.hook_types.includes(hookType)
        ? current.hook_types.filter((value) => value !== hookType)
        : [...current.hook_types, hookType],
    }));
  }

  async function saveEntry() {
    if (!draft.reference_link.trim() || isSaving) return;
    setIsSaving(true);
    setMessage(null);

    const views = draft.views.trim() === "" ? null : Number(draft.views);
    const engagementRate =
      draft.engagement_rate.trim() === ""
        ? null
        : Number(draft.engagement_rate);

    if (
      (views !== null && (!Number.isFinite(views) || views < 0)) ||
      (engagementRate !== null &&
        (!Number.isFinite(engagementRate) ||
          engagementRate < 0 ||
          engagementRate > 100))
    ) {
      setMessage(
        "Views must be zero or higher, and engagement rate must be between 0 and 100.",
      );
      setIsSaving(false);
      return;
    }

    const payload = {
      division_task_id: taskId,
      reference_link: draft.reference_link.trim(),
      format: draft.format,
      hook: draft.hook.trim() || null,
      storytelling_approach:
        draft.storytelling_approach.trim() || null,
      used_trending_audio: draft.used_trending_audio,
      audio_name:
        draft.used_trending_audio && draft.audio_name.trim()
          ? draft.audio_name.trim()
          : null,
      views,
      engagement_rate: engagementRate,
      hook_types: draft.hook_types,
      hook_explanation: draft.hook_explanation.trim() || null,
      content_type: draft.content_type || null,
      why_it_worked: draft.why_it_worked.trim() || null,
      cta: draft.cta.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const mutation = editingId
      ? supabase
          .from("social_research_entries")
          .update(payload)
          .eq("id", editingId)
      : supabase.from("social_research_entries").insert(payload);
    const { data, error } = await mutation
      .select(
        "id, division_task_id, reference_link, format, hook, storytelling_approach, used_trending_audio, audio_name, views, engagement_rate, hook_types, hook_explanation, content_type, why_it_worked, cta, created_at",
      )
      .single();

    setIsSaving(false);
    if (error || !data) {
      setMessage(
        `Could not save the research entry: ${
          error?.message ?? "No entry returned."
        }`,
      );
      return;
    }

    const savedEntry = normalizeEntry(data as SocialResearchEntry);
    setEntries((current) =>
      editingId
        ? current.map((entry) =>
            entry.id === editingId ? savedEntry : entry,
          )
        : [savedEntry, ...current],
    );
    setFailedEmbeds((current) => {
      const next = { ...current };
      delete next[savedEntry.id];
      return next;
    });
    setMessage(null);
    setIsEditorOpen(false);
  }

  async function deleteEntry(entryId: string) {
    if (isSaving) return;
    setIsSaving(true);
    const { error } = await supabase
      .from("social_research_entries")
      .delete()
      .eq("id", entryId);
    setIsSaving(false);

    if (error) {
      setMessage(`Could not delete the research entry: ${error.message}`);
      return;
    }
    setEntries((current) =>
      current.filter((entry) => entry.id !== entryId),
    );
  }

  async function planToShoot(entry: SocialResearchEntry) {
    if (!isOwner || planningEntryId) return;
    setPlanningEntryId(entry.id);
    setMessage(null);

    const titleDescriptor = entry.content_type
      ? `${SOCIAL_CONTENT_TYPE_LABELS[entry.content_type]} ${
          SOCIAL_POST_FORMAT_LABELS[entry.format]
        }`
      : `Social media ${SOCIAL_POST_FORMAT_LABELS[entry.format]}`;
    const filmingData = {
      filming_date: "",
      participants: [],
      needs_models: false,
      script: entry.hook_explanation || entry.storytelling_approach || "",
      prep_work: "",
      footage_drive_link: "",
      filmed: false,
      source_reference_id: entry.id,
      source_reference_url: entry.reference_link,
    };

    const { data: existingBrief, error: lookupError } = await supabase
      .from("division_tasks")
      .select("id")
      .eq("client_id", clientId)
      .eq("division", "social-media")
      .eq("template_type", "content_brief")
      .contains("filming_card_data", {
        source_reference_id: entry.id,
      })
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      setPlanningEntryId(null);
      setMessage(
        `Could not check for an existing content brief: ${lookupError.message}`,
      );
      return;
    }

    if (existingBrief) {
      const { error: updateError } = await supabase
        .from("division_tasks")
        .update({ filming_card_data: filmingData })
        .eq("id", existingBrief.id);

      setPlanningEntryId(null);
      if (updateError) {
        setMessage(
          `Could not update the content brief: ${updateError.message}`,
        );
        return;
      }

      router.push(`/team-hub/projects/${existingBrief.id}`);
      return;
    }

    const { data: newBrief, error } = await supabase
      .from("division_tasks")
      .insert({
        client_id: clientId,
        division: "social-media",
        title: `Content brief — ${titleDescriptor}`,
        description: "Filming plan created from social media research.",
        status: "planning",
        template_type: "content_brief",
        content_brief_data: EMPTY_CONTENT_BRIEF_DATA,
        filming_card_data: filmingData,
        research_entries: [],
      })
      .select("id")
      .single();

    setPlanningEntryId(null);
    if (error || !newBrief) {
      setMessage(
        `Could not create the content brief: ${
          error?.message ?? "No task returned."
        }`,
      );
      return;
    }

    router.push(`/team-hub/projects/${newBrief.id}`);
  }

  return (
    <section className="mt-8 rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
            Research template
          </p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--foreground)]">
            Social media content research
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
            Save useful reference content and document the creative patterns
            worth learning from.
          </p>
        </div>
        <TeamButton type="button" themed onClick={openNewEntry}>
          + Add reference
        </TeamButton>
      </div>

      {message && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
        >
          {message}
        </p>
      )}

      {isLoading ? (
        <div className="mt-6 grid gap-4">
          {[0, 1].map((item) => (
            <div
              key={item}
              className="h-[420px] animate-pulse rounded-[22px] border border-[var(--border)] bg-[var(--background)]"
            />
          ))}
        </div>
      ) : entries.length ? (
        <div className="mt-6 grid gap-5">
          {entries.map((entry) => {
            const embedUrl = resolveInstagramEmbedUrl(entry.reference_link);
            const embedFailed = failedEmbeds[entry.id];

            return (
              <article
                key={entry.id}
                className="overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--background)]"
              >
                <div className="grid lg:grid-cols-[minmax(300px,410px)_minmax(0,1fr)]">
                  <div className="border-b border-[var(--border)] bg-[var(--card)] p-4 lg:border-b-0 lg:border-r">
                    {embedUrl && !embedFailed ? (
                      <iframe
                        src={embedUrl}
                        title={`Instagram preview for ${entryTitle(entry)}`}
                        loading="lazy"
                        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                        className="h-[590px] w-full rounded-[16px] border border-[var(--border)] bg-white"
                        onError={() =>
                          setFailedEmbeds((current) => ({
                            ...current,
                            [entry.id]: true,
                          }))
                        }
                      />
                    ) : (
                      <div className="flex h-[360px] items-center justify-center rounded-[16px] border border-dashed border-[var(--border)] bg-[var(--muted)] px-6 text-center">
                        <div>
                          <p className="text-sm font-semibold text-[var(--foreground)]">
                            {embedUrl
                              ? "This Instagram post could not be previewed."
                              : "Embedded previews are available for Instagram links."}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
                            Open the original reference to view it directly.
                          </p>
                        </div>
                      </div>
                    )}
                    <a
                      href={entry.reference_link}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex text-xs font-semibold text-[var(--primary)] underline underline-offset-4"
                    >
                      Open original reference ↗
                    </a>
                  </div>

                  <div className="min-w-0 p-5 sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--foreground)]">
                            {SOCIAL_POST_FORMAT_LABELS[entry.format]}
                          </span>
                          {entry.content_type && (
                            <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--foreground)]">
                              {
                                SOCIAL_CONTENT_TYPE_LABELS[
                                  entry.content_type
                                ]
                              }
                            </span>
                          )}
                          {entry.used_trending_audio && (
                            <span className="rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--accent-foreground)]">
                              Trending audio
                            </span>
                          )}
                        </div>
                        <h3 className="mt-3 text-lg font-semibold leading-7 text-[var(--foreground)]">
                          {entryTitle(entry)}
                        </h3>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {isOwner && (
                          <TeamButton
                            type="button"
                            themed
                            disabled={Boolean(planningEntryId)}
                            onClick={() => void planToShoot(entry)}
                          >
                            {planningEntryId === entry.id
                              ? "Preparing content brief…"
                              : "Plan to shoot"}
                          </TeamButton>
                        )}
                        <TeamButton
                          type="button"
                          themed
                          tone="secondary"
                          onClick={() => openEntry(entry)}
                        >
                          Edit
                        </TeamButton>
                        <TeamButton
                          type="button"
                          themed
                          tone="danger"
                          disabled={isSaving}
                          onClick={() => void deleteEntry(entry.id)}
                        >
                          Delete
                        </TeamButton>
                      </div>
                    </div>

                    <dl className="mt-6 grid gap-x-5 gap-y-4 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                          Views
                        </dt>
                        <dd className="mt-1 font-semibold text-[var(--foreground)]">
                          {formatViews(entry.views)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                          Engagement rate
                        </dt>
                        <dd className="mt-1 font-semibold text-[var(--foreground)]">
                          {entry.engagement_rate === null
                            ? "Not recorded"
                            : `${entry.engagement_rate}%`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                          Hook
                        </dt>
                        <dd className="mt-1 leading-6 text-[var(--foreground)]">
                          {entry.hook || "Not noted"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                          Hook types
                        </dt>
                        <dd className="mt-1 flex flex-wrap gap-1.5">
                          {entry.hook_types.length
                            ? entry.hook_types.map((hookType) => (
                                <span
                                  key={hookType}
                                  className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[10px] font-semibold text-[var(--foreground)]"
                                >
                                  {SOCIAL_HOOK_TYPE_LABELS[hookType]}
                                </span>
                              ))
                            : "Not categorized"}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                          How the hook works
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap leading-6 text-[var(--foreground)]">
                          {entry.hook_explanation || "Not noted"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                          Storytelling approach
                        </dt>
                        <dd className="mt-1 leading-6 text-[var(--foreground)]">
                          {entry.storytelling_approach || "Not noted"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                          Audio
                        </dt>
                        <dd className="mt-1 leading-6 text-[var(--foreground)]">
                          {entry.used_trending_audio
                            ? entry.audio_name || "Trending audio, unnamed"
                            : "No trending audio"}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                          Why it worked
                        </dt>
                        <dd className="mt-1 whitespace-pre-wrap leading-6 text-[var(--foreground)]">
                          {entry.why_it_worked || "Not analyzed yet"}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                          CTA
                        </dt>
                        <dd className="mt-1 leading-6 text-[var(--foreground)]">
                          {entry.cta || "No CTA noted"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-[20px] border border-dashed border-[var(--border)] bg-[var(--background)] px-6 py-12 text-center">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            No reference content logged yet.
          </p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Add an Instagram, TikTok, or other useful social reference.
          </p>
        </div>
      )}

      <TeamModal
        open={isEditorOpen}
        title={editingId ? "Edit reference" : "Add reference"}
        description="Capture the creative structure and performance signals that made this content useful."
        submitLabel={editingId ? "Save reference" : "Add reference"}
        submitDisabled={!draft.reference_link.trim()}
        isSaving={isSaving}
        themed
        onClose={() => {
          if (!isSaving) setIsEditorOpen(false);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void saveEntry();
        }}
      >
        <div className="grid gap-4">
          <label className="text-xs font-semibold text-[var(--foreground)]">
            Reference link
            <input
              type="url"
              autoFocus
              required
              value={draft.reference_link}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  reference_link: event.target.value,
                }))
              }
              className={`mt-2 ${projectInputClass}`}
              placeholder="https://www.instagram.com/reel/..."
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[var(--foreground)]">
              Format
              <select
                value={draft.format}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    format: event.target.value as SocialPostFormat,
                  }))
                }
                className={`mt-2 ${projectInputClass}`}
              >
                {SOCIAL_POST_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {SOCIAL_POST_FORMAT_LABELS[format]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-[var(--foreground)]">
              Content type
              <select
                value={draft.content_type}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    content_type: event.target.value as
                      | SocialContentType
                      | "",
                  }))
                }
                className={`mt-2 ${projectInputClass}`}
              >
                <option value="">Not categorized</option>
                {SOCIAL_CONTENT_TYPES.map((contentType) => (
                  <option key={contentType} value={contentType}>
                    {SOCIAL_CONTENT_TYPE_LABELS[contentType]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[var(--foreground)]">
              Views
              <input
                type="number"
                min="0"
                step="1"
                value={draft.views}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    views: event.target.value,
                  }))
                }
                className={`mt-2 ${projectInputClass}`}
                placeholder="Optional"
              />
            </label>
            <label className="text-xs font-semibold text-[var(--foreground)]">
              Engagement rate (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.001"
                value={draft.engagement_rate}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    engagement_rate: event.target.value,
                  }))
                }
                className={`mt-2 ${projectInputClass}`}
                placeholder="Optional"
              />
            </label>
          </div>

          <label className="text-xs font-semibold text-[var(--foreground)]">
            Hook
            <TaskMentionInput
              value={draft.hook}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  hook: value,
                }))
              }
              members={teamMembers}
              onMention={(username) =>
                void appendDivisionTaskMention(taskId, username)
              }
              className={`mt-2 ${projectInputClass}`}
              placeholder="What is the opening line or frame?"
            />
          </label>

          <fieldset>
            <legend className="text-xs font-semibold text-[var(--foreground)]">
              Hook types
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {SOCIAL_HOOK_TYPES.map((hookType) => (
                <label
                  key={hookType}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${
                    draft.hook_types.includes(hookType)
                      ? "border-[var(--primary)] bg-[var(--muted)] text-[var(--foreground)]"
                      : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={draft.hook_types.includes(hookType)}
                    onChange={() => toggleHookType(hookType)}
                    className="size-4 accent-[var(--primary)]"
                  />
                  {SOCIAL_HOOK_TYPE_LABELS[hookType]}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="text-xs font-semibold text-[var(--foreground)]">
            Hook explanation
            <TaskMentionTextarea
              rows={4}
              value={draft.hook_explanation}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  hook_explanation: value,
                }))
              }
              members={teamMembers}
              onMention={(username) =>
                void appendDivisionTaskMention(taskId, username)
              }
              className={`mt-2 resize-y ${projectInputClass}`}
              placeholder="Explain how the hook earns attention."
            />
          </label>

          <label className="text-xs font-semibold text-[var(--foreground)]">
            Storytelling approach
            <TaskMentionInput
              value={draft.storytelling_approach}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  storytelling_approach: value,
                }))
              }
              members={teamMembers}
              onMention={(username) =>
                void appendDivisionTaskMention(taskId, username)
              }
              className={`mt-2 ${projectInputClass}`}
              placeholder="Myth-busting, before/after, personal story…"
            />
          </label>

          <label className="text-xs font-semibold text-[var(--foreground)]">
            Why it worked
            <TaskMentionTextarea
              rows={5}
              value={draft.why_it_worked}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  why_it_worked: value,
                }))
              }
              members={teamMembers}
              onMention={(username) =>
                void appendDivisionTaskMention(taskId, username)
              }
              className={`mt-2 resize-y ${projectInputClass}`}
              placeholder="Neutral analysis of what made the content effective."
            />
          </label>

          <label className="text-xs font-semibold text-[var(--foreground)]">
            CTA
            <TaskMentionInput
              value={draft.cta}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  cta: value,
                }))
              }
              members={teamMembers}
              onMention={(username) =>
                void appendDivisionTaskMention(taskId, username)
              }
              className={`mt-2 ${projectInputClass}`}
              placeholder="Optional call-to-action"
            />
          </label>

          <fieldset>
            <legend className="text-xs font-semibold text-[var(--foreground)]">
              Used viral or trending audio?
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[true, false].map((value) => (
                <label
                  key={String(value)}
                  className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-xs font-semibold transition ${
                    draft.used_trending_audio === value
                      ? "border-[var(--primary)] bg-[var(--muted)] text-[var(--foreground)]"
                      : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]"
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    checked={draft.used_trending_audio === value}
                    onChange={() =>
                      setDraft((current) => ({
                        ...current,
                        used_trending_audio: value,
                        audio_name: value ? current.audio_name : "",
                      }))
                    }
                  />
                  {value ? "Yes" : "No"}
                </label>
              ))}
            </div>
          </fieldset>

          {draft.used_trending_audio && (
            <label className="text-xs font-semibold text-[var(--foreground)]">
              Audio name
              <TaskMentionInput
                value={draft.audio_name}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    audio_name: value,
                  }))
                }
                members={teamMembers}
                onMention={(username) =>
                  void appendDivisionTaskMention(taskId, username)
                }
                className={`mt-2 ${projectInputClass}`}
                placeholder="Optional audio or sound name"
              />
            </label>
          )}
        </div>
      </TeamModal>
    </section>
  );
}
