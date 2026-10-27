"use client";

import { useState } from "react";
import type { VideoEditBrief } from "@/lib/ai-workspace/schemas";
import { buildClaudeDesktopPrompt, footageLabel, formatSeconds } from "@/lib/ai-workspace/video-edit-brief";

// Output is validated against videoEditBriefSchema before it is stored; this only narrows by kind.
export function isVideoEditBrief(output: unknown): output is VideoEditBrief {
  return typeof output === "object" && output !== null && (output as { kind?: unknown }).kind === "video_edit_brief";
}

function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#8A7896]">{title}</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#3B2B4A]">{children}</dd></div>;
}

function List({ values }: { values: string[] }) {
  return values.length ? <ul className="list-disc space-y-1 pl-5">{values.map((value, index) => <li key={index}>{value}</li>)}</ul> : <span className="text-[#8A7896]">None</span>;
}

export function VideoEditBriefView({ output }: { output: VideoEditBrief }) {
  const [notice, setNotice] = useState("");
  const segments = [...output.segments].sort((a, b) => a.order - b.order);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(buildClaudeDesktopPrompt(output, window.location.href));
      setNotice("Copied. Paste it into Claude Desktop with the footage files.");
    } catch {
      setNotice("Copy failed. Open Raw output and copy it manually.");
    }
  }

  return <div className="space-y-4">
    <p role="note" className="rounded-lg border border-[#E4C98F] bg-[#FFF7E6] px-3 py-2 text-sm text-[#6B4E12]">
      <strong>AI-generated edit plan · human review required.</strong> Nothing has been edited, rendered, uploaded, published, or sent.
    </p>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void copyPrompt()} className="rounded-lg bg-[#432560] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#32194C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]">Copy for Claude Desktop</button>
      {notice && <span role="status" className="text-xs text-[#685376]">{notice}</span>}
    </div>
    <dl className="space-y-4">
      <Item title="Title">{output.title}</Item>
      <Item title="Format">{output.platform || "—"} · {output.aspect_ratio} · {output.target_duration_seconds}s · {output.export.resolution} @ {output.export.frame_rate}fps</Item>
      <Item title="Hook">{output.hook}</Item>
      <Item title="Edit list">
        <ol className="mt-1 space-y-3">
          {segments.map((segment) => <li key={segment.order} className="rounded-lg bg-[#F5EFF8] p-3">
            <p className="font-semibold text-[#321D4B]">{segment.order}. {formatSeconds(segment.start_seconds)}–{formatSeconds(segment.end_seconds)} · {segment.purpose}</p>
            <p className="mt-1 text-xs text-[#685376]">{footageLabel(segment.footage.source)}: {segment.footage.description}{segment.footage.file_url && <> · <a href={segment.footage.file_url} target="_blank" rel="noreferrer" className="underline">{segment.footage.file_name ?? "file"}</a></>}</p>
            {segment.on_screen_text && <p className="mt-1">Text: {segment.on_screen_text}</p>}
            {segment.voiceover && <p className="mt-1">Voiceover: {segment.voiceover}</p>}
            {segment.transition && <p className="mt-1 text-xs">Transition: {segment.transition}</p>}
            {segment.notes && <p className="mt-1 text-xs">{segment.notes}</p>}
          </li>)}
        </ol>
      </Item>
      <Item title="Captions">{output.captions.burn_in ? "Burned in" : "Separate track"} · {output.captions.style} · {output.captions.language}</Item>
      <Item title="Audio">{output.audio.music_direction}{output.audio.voiceover_required ? " · Voiceover required" : ""}{output.audio.sound_effects.length ? ` · SFX: ${output.audio.sound_effects.join(", ")}` : ""}</Item>
      <Item title="Cover">{output.cover.headline}{output.cover.subheadline ? ` / ${output.cover.subheadline}` : ""}{output.cover.frame_seconds !== null ? ` · frame at ${formatSeconds(output.cover.frame_seconds)}` : ""}</Item>
      <Item title="Missing footage"><List values={output.footage_gaps} /></Item>
      <Item title="Finish in CapCut"><List values={output.capcut_finishing_notes} /></Item>
      <Item title="Notes"><List values={output.notes} /></Item>
    </dl>
  </div>;
}
