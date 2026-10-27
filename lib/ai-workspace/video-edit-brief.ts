import type { VideoEditBrief } from "./schemas";

const FOOTAGE_LABELS: Record<VideoEditBrief["segments"][number]["footage"]["source"], string> = {
  client_asset: "Client asset",
  generated: "AI-generated",
  to_film: "Still to film",
  stock_needed: "Stock needed",
};

export function footageLabel(source: VideoEditBrief["segments"][number]["footage"]["source"]): string {
  return FOOTAGE_LABELS[source];
}

export function formatSeconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${minutes}:${seconds.toFixed(seconds % 1 === 0 ? 0 : 1).padStart(seconds % 1 === 0 ? 2 : 4, "0")}`;
}

function line(label: string, value: string | null): string | null {
  return value && value.trim() ? `   - ${label}: ${value.trim()}` : null;
}

// Plain-text instructions a person pastes into Claude Desktop to cut the first draft, which they then finish in CapCut.
export function buildClaudeDesktopPrompt(brief: VideoEditBrief, portalTaskUrl?: string): string {
  const segments = [...brief.segments].sort((a, b) => a.order - b.order);
  const parts: (string | null)[] = [
    `Cut a first draft of this video, then put it into my CapCut so I can finish the edit there.`,
    `Do not publish, upload, or send it anywhere else.`,
    ``,
    `# ${brief.title}`,
    `- Platform: ${brief.platform || "—"}`,
    `- Aspect ratio: ${brief.aspect_ratio} · Export: ${brief.export.resolution} @ ${brief.export.frame_rate}fps`,
    `- Target length: ${brief.target_duration_seconds}s`,
    `- Hook: ${brief.hook || "—"}`,
    portalTaskUrl ? `- Portal task: ${portalTaskUrl}` : null,
    ``,
    `## Edit list`,
  ];
  segments.forEach((segment) => {
    const footage = segment.footage;
    const file = footage.file_url ? ` — ${footage.file_name ?? "file"}: ${footage.file_url}` : "";
    parts.push(
      `${segment.order}. ${formatSeconds(segment.start_seconds)}–${formatSeconds(segment.end_seconds)} · ${segment.purpose}`,
      `   - Footage (${footageLabel(footage.source)}): ${footage.description}${file}`,
      line("On-screen text", segment.on_screen_text),
      line("Voiceover", segment.voiceover),
      line("Transition", segment.transition),
      line("Notes", segment.notes),
    );
  });
  parts.push(
    ``,
    `## Captions and audio`,
    `- Captions: ${brief.captions.burn_in ? "burn in" : "keep as a separate track"} · ${brief.captions.style} · ${brief.captions.language}`,
    `- Music: ${brief.audio.music_direction}`,
    `- Voiceover required: ${brief.audio.voiceover_required ? "yes" : "no"}`,
    brief.audio.sound_effects.length ? `- Sound effects: ${brief.audio.sound_effects.join("; ")}` : null,
    `- Cover: ${brief.cover.headline}${brief.cover.subheadline ? ` / ${brief.cover.subheadline}` : ""}${brief.cover.frame_seconds !== null ? ` (frame at ${formatSeconds(brief.cover.frame_seconds)})` : ""}`,
  );
  if (brief.footage_gaps.length) parts.push(``, `## Missing footage (leave a placeholder and tell me)`, ...brief.footage_gaps.map((gap) => `- ${gap}`));
  if (brief.capcut_finishing_notes.length) parts.push(``, `## I will finish these in CapCut`, ...brief.capcut_finishing_notes.map((note) => `- ${note}`));
  if (brief.notes.length) parts.push(``, `## Notes`, ...brief.notes.map((note) => `- ${note}`));
  return parts.filter((part): part is string => part !== null).join("\n");
}
