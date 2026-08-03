"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FILMING_PARTICIPANTS_BY_CLIENT,
  normalizeFilmingCardData,
  type FilmingCardData,
} from "@/lib/division-tasks";
import { resolveGoogleDriveFileUrls } from "@/lib/google-drive";
import { projectInputClass } from "@/lib/project-client-theme";
import { appendDivisionTaskMention } from "@/lib/project-mentions";
import { resolveInstagramEmbedUrl } from "@/lib/social-content";
import { supabase } from "@/lib/supabase";
import type { WorkspaceClientSlug } from "@/lib/workspace-clients";
import { TeamButton } from "../../_components/TeamHubUi";
import {
  TaskMentionInput,
  TaskMentionTextarea,
} from "./TaskMentionTextarea";
import { useTaskTeamMembers } from "./TaskPeoplePicker";

type SourceReference = {
  id: string;
  reference_link: string;
  hook: string | null;
  storytelling_approach: string | null;
};

function FootagePreview({ link }: { link: string }) {
  const urls = useMemo(() => resolveGoogleDriveFileUrls(link), [link]);
  const [state, setState] =
    useState<"loading" | "loaded" | "failed">("loading");

  useEffect(() => {
    if (!urls) return;

    const timeout = window.setTimeout(() => {
      setState((current) =>
        current === "loading" ? "failed" : current,
      );
    }, 6000);
    return () => window.clearTimeout(timeout);
  }, [urls]);

  if (!urls || state === "failed") {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--muted)] px-6 py-10 text-center">
        <p className="text-sm font-semibold text-[var(--foreground)]">
          This footage can&apos;t be previewed here — open it directly instead.
        </p>
        {urls?.openUrl && (
          <a
            href={urls.openUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex rounded-full bg-[var(--primary)] px-4 py-2.5 text-xs font-semibold text-[var(--primary-foreground)]"
          >
            Open in Google Drive ↗
          </a>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <a
          href={urls.openUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-full bg-[var(--primary)] px-4 py-2.5 text-xs font-semibold text-[var(--primary-foreground)]"
        >
          Open in Google Drive ↗
        </a>
      </div>
      <div className="relative h-[430px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        <iframe
          src={urls.previewUrl}
          title="Filming footage preview"
          loading="lazy"
          allow="autoplay"
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
          className="h-full w-full"
        />
        {state === "loading" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--card)]/90 text-xs font-medium text-[var(--muted-foreground)]">
            Loading footage preview…
          </div>
        )}
      </div>
    </div>
  );
}

export function FilmingDetailsEditor({
  taskId,
  clientSlug,
  initialData,
}: {
  taskId: string;
  clientSlug: WorkspaceClientSlug;
  initialData: unknown;
}) {
  const teamMembers = useTaskTeamMembers();
  const [card, setCard] = useState<FilmingCardData>(() =>
    normalizeFilmingCardData(initialData),
  );
  const [hasFilmingDetails, setHasFilmingDetails] = useState(
    Boolean(
      initialData &&
        typeof initialData === "object" &&
        !Array.isArray(initialData),
    ),
  );
  const [isExpanded, setIsExpanded] = useState(hasFilmingDetails);
  const [sourceReference, setSourceReference] =
    useState<SourceReference | null>(null);
  const [customParticipant, setCustomParticipant] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  const participantOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...(FILMING_PARTICIPANTS_BY_CLIENT[clientSlug] ?? []),
          ...card.participants,
        ]),
      ),
    [card.participants, clientSlug],
  );
  const sourceUrl =
    sourceReference?.reference_link || card.source_reference_url;
  const sourceEmbedUrl = resolveInstagramEmbedUrl(sourceUrl);

  useEffect(() => {
    if (!card.source_reference_id) return;
    let isActive = true;

    async function loadSourceReference() {
      const { data } = await supabase
        .from("social_research_entries")
        .select("id, reference_link, hook, storytelling_approach")
        .eq("id", card.source_reference_id)
        .maybeSingle();

      if (isActive && data) setSourceReference(data as SourceReference);
    }

    void loadSourceReference();
    return () => {
      isActive = false;
    };
  }, [card.source_reference_id]);

  function updateField<Key extends keyof FilmingCardData>(
    field: Key,
    value: FilmingCardData[Key],
  ) {
    setCard((current) => ({ ...current, [field]: value }));
    setMessage(null);
  }

  function toggleParticipant(participant: string) {
    updateField(
      "participants",
      card.participants.includes(participant)
        ? card.participants.filter((value) => value !== participant)
        : [...card.participants, participant],
    );
  }

  function addParticipant() {
    const participant = customParticipant.trim();
    if (!participant) return;
    if (!card.participants.includes(participant)) {
      updateField("participants", [...card.participants, participant]);
    }
    setCustomParticipant("");
  }

  async function saveCard() {
    if (isSaving) return;
    if (
      card.footage_drive_link.trim() &&
      !resolveGoogleDriveFileUrls(card.footage_drive_link)
    ) {
      setMessage({
        tone: "error",
        text: "Paste a valid Google Drive file link for the footage.",
      });
      return;
    }

    setIsSaving(true);
    setMessage(null);
    const normalizedCard = {
      ...card,
      script: card.script.trim(),
      prep_work: card.prep_work.trim(),
      footage_drive_link: card.footage_drive_link.trim(),
    };
    const { error } = await supabase
      .from("division_tasks")
      .update({ filming_card_data: normalizedCard })
      .eq("id", taskId);
    setIsSaving(false);

    if (error) {
      setMessage({
        tone: "error",
        text: `Could not save filming details: ${error.message}`,
      });
      return;
    }

    setCard(normalizedCard);
    setHasFilmingDetails(true);
    setMessage({ tone: "success", text: "Filming details saved." });
  }

  if (!hasFilmingDetails) {
    return (
      <section className="mt-6 rounded-[20px] border border-dashed border-[var(--border)] bg-[var(--background)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--foreground)]">
              Filming
            </h3>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
              Add production details if this content brief needs a shoot.
            </p>
          </div>
          <TeamButton
            type="button"
            themed
            tone="secondary"
            onClick={() => {
              setHasFilmingDetails(true);
              setIsExpanded(true);
            }}
          >
            + Add filming details
          </TeamButton>
        </div>
      </section>
    );
  }

  if (!isExpanded) {
    return (
      <section className="mt-6 rounded-[20px] border border-[var(--border)] bg-[var(--background)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--foreground)]">
              Filming
            </h3>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
              {card.filmed
                ? "Filming completed."
                : card.filming_date
                  ? `Scheduled for ${card.filming_date}.`
                  : "Filming details have been added."}
            </p>
          </div>
          <TeamButton
            type="button"
            themed
            tone="secondary"
            onClick={() => setIsExpanded(true)}
          >
            Expand filming details
          </TeamButton>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-[20px] border border-[var(--border)] bg-[var(--background)] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
            Optional production details
          </p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--foreground)]">
            Filming
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            Coordinate the shoot, prep, participants, and finished footage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TeamButton
            type="button"
            themed
            tone="secondary"
            disabled={isSaving}
            onClick={() => setIsExpanded(false)}
          >
            Collapse
          </TeamButton>
          <TeamButton
            type="button"
            themed
            disabled={isSaving}
            onClick={() => void saveCard()}
          >
            {isSaving ? "Saving…" : "Save filming details"}
          </TeamButton>
        </div>
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

      {sourceUrl && (
        <div className="mt-6 rounded-[20px] border border-[var(--border)] bg-[var(--background)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">
            Planned from research reference
          </p>
          <div className="mt-3 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            {sourceEmbedUrl ? (
              <iframe
                src={sourceEmbedUrl}
                title="Source Instagram research reference"
                loading="lazy"
                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                className="h-[390px] w-full rounded-2xl border border-[var(--border)] bg-white"
              />
            ) : (
              <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--muted)] px-5 text-center text-xs text-[var(--muted-foreground)]">
                Preview unavailable for this reference link.
              </div>
            )}
            <div className="self-center">
              {sourceReference?.hook && (
                <p className="text-base font-semibold leading-7 text-[var(--foreground)]">
                  {sourceReference.hook}
                </p>
              )}
              {sourceReference?.storytelling_approach && (
                <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                  {sourceReference.storytelling_approach}
                </p>
              )}
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex text-xs font-semibold text-[var(--primary)] underline underline-offset-4"
              >
                Open original reference ↗
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <label className="text-xs font-semibold text-[var(--foreground)]">
          Filming date
          <input
            type="date"
            value={card.filming_date}
            onChange={(event) =>
              updateField("filming_date", event.target.value)
            }
            className={`mt-2 ${projectInputClass}`}
          />
        </label>

        <fieldset>
          <legend className="text-xs font-semibold text-[var(--foreground)]">
            Needs bodies / models?
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[true, false].map((value) => (
              <label
                key={String(value)}
                className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-xs font-semibold transition ${
                  card.needs_models === value
                    ? "border-[var(--primary)] bg-[var(--muted)] text-[var(--foreground)]"
                    : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]"
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  checked={card.needs_models === value}
                  onChange={() => updateField("needs_models", value)}
                />
                {value ? "Yes" : "No"}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="lg:col-span-2">
          <legend className="text-xs font-semibold text-[var(--foreground)]">
            Participants
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {participantOptions.map((participant) => (
              <label
                key={participant}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${
                  card.participants.includes(participant)
                    ? "border-[var(--primary)] bg-[var(--muted)] text-[var(--foreground)]"
                    : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={card.participants.includes(participant)}
                  onChange={() => toggleParticipant(participant)}
                  className="size-4 accent-[var(--primary)]"
                />
                {participant}
              </label>
            ))}
          </div>
          <div className="mt-3 flex max-w-md gap-2">
            <TaskMentionInput
              value={customParticipant}
              onChange={setCustomParticipant}
              members={teamMembers}
              onMention={(username) =>
                void appendDivisionTaskMention(taskId, username)
              }
              onEnter={addParticipant}
              className={projectInputClass}
              placeholder="Add a participant or type @ to mention"
            />
            <TeamButton
              type="button"
              themed
              tone="secondary"
              onClick={addParticipant}
            >
              Add
            </TeamButton>
          </div>
        </fieldset>

        <label className="text-xs font-semibold text-[var(--foreground)] lg:col-span-2">
          Script
          <TaskMentionTextarea
            rows={8}
            value={card.script}
            onChange={(value) => updateField("script", value)}
            members={teamMembers}
            onMention={(username) =>
              void appendDivisionTaskMention(taskId, username)
            }
            className={`mt-2 resize-y ${projectInputClass}`}
            placeholder="Write or refine the filming script."
          />
        </label>

        <label className="text-xs font-semibold text-[var(--foreground)] lg:col-span-2">
          Prep work needed
          <TaskMentionTextarea
            rows={6}
            value={card.prep_work}
            onChange={(value) => updateField("prep_work", value)}
            members={teamMembers}
            onMention={(username) =>
              void appendDivisionTaskMention(taskId, username)
            }
            className={`mt-2 resize-y ${projectInputClass}`}
            placeholder="Equipment, location, wardrobe, props, shot list…"
          />
        </label>

        <label className="text-xs font-semibold text-[var(--foreground)] lg:col-span-2">
          Footage Drive link
          <input
            type="url"
            value={card.footage_drive_link}
            onChange={(event) =>
              updateField("footage_drive_link", event.target.value)
            }
            className={`mt-2 ${projectInputClass}`}
            placeholder="https://drive.google.com/file/d/..."
          />
          <span className="mt-2 block text-[11px] font-normal leading-5 text-[var(--muted-foreground)]">
            Make sure the file is shared as “Anyone with the link can view.”
          </span>
        </label>

        <label className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 text-sm font-semibold text-[var(--foreground)] lg:col-span-2">
          <input
            type="checkbox"
            checked={card.filmed}
            onChange={(event) => updateField("filmed", event.target.checked)}
            className="size-5 accent-[var(--primary)]"
          />
          Filmed — production has been completed
        </label>
      </div>

      {card.footage_drive_link.trim() && (
        <div className="mt-6">
          <FootagePreview
            key={card.footage_drive_link}
            link={card.footage_drive_link}
          />
        </div>
      )}
    </section>
  );
}
