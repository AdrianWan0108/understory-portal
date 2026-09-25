import type { ContentResult } from "@/lib/ai-workspace/schemas";

// Output is validated against contentResultSchema before it is stored; this only narrows by kind.
export function isContentResult(output: unknown): output is ContentResult {
  return typeof output === "object" && output !== null && (output as { kind?: unknown }).kind === "content_result";
}

function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-[#8A7896]">{title}</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#3B2B4A]">{children}</dd></div>;
}

function List({ values }: { values: string[] }) {
  return values.length ? <ul className="list-disc space-y-1 pl-5">{values.map((value, index) => <li key={index}>{value}</li>)}</ul> : <span className="text-[#8A7896]">None</span>;
}

export function ContentResultView({ output }: { output: ContentResult }) {
  const brief = output.reel_cover_brief;
  return <div className="space-y-4">
    <p role="note" className="rounded-lg border border-[#E4C98F] bg-[#FFF7E6] px-3 py-2 text-sm text-[#6B4E12]">
      <strong>AI-generated draft · human review required.</strong> This content has not been approved, scheduled, uploaded, published, or sent to anyone.
    </p>
    <dl className="space-y-4">
      <Item title="Hook">{output.hook}</Item>
      <Item title="Caption">{output.caption}</Item>
      <Item title="CTA">{output.cta}</Item>
      <Item title="Hashtags">{output.hashtags.length ? output.hashtags.join(" ") : <span className="text-[#8A7896]">None</span>}</Item>
      <Item title="Cover headline">{output.cover_headline}</Item>
      <Item title="Cover subheadline">{output.cover_subheadline ?? <span className="text-[#8A7896]">None</span>}</Item>
      <Item title="Visual direction">{output.visual_direction}</Item>
      <Item title="Reel cover brief">
        <dl className="mt-1 space-y-3 rounded-lg bg-[#F5EFF8] p-3">
          <Item title="Concept">{brief.concept}</Item>
          <Item title="Subject">{brief.subject ?? <span className="text-[#8A7896]">None</span>}</Item>
          <Item title="Composition">{brief.composition}</Item>
          <Item title="Background">{brief.background}</Item>
          <Item title="Text placement">{brief.text_placement}</Item>
          <Item title="Asset requirements"><List values={brief.asset_requirements} /></Item>
        </dl>
      </Item>
      <Item title="Notes"><List values={output.notes} /></Item>
      <Item title="Human review">Required before this draft is used anywhere.</Item>
    </dl>
  </div>;
}
