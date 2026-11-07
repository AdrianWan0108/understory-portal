function escapeSlack(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replace(/\s+/g, " ").trim();
}

export function aiSlackNotification(input: { client: string; title: string; agent: string; status: string; requester: string; date: string; summary: string; url: string }) {
  return [
    `*${escapeSlack(input.client)}* · ${escapeSlack(input.title)}`,
    `${escapeSlack(input.agent)} · ${escapeSlack(input.status)} · Requested by ${escapeSlack(input.requester)}`,
    `Date: ${escapeSlack(input.date)}`,
    escapeSlack(input.summary).slice(0, 400),
    `<${input.url}|Open exact portal task>`,
  ].join("\n");
}

type BriefItem = { title: string; due_date: string | null; owner: string | null };
const briefLine = (item: BriefItem) => `• ${escapeSlack(item.title)}${item.due_date ? ` · ${item.due_date.slice(5).replace("-", "/")}` : ""}${item.owner ? ` · ${escapeSlack(item.owner)}` : ""}`;

// Daily Event Planner post. Only sections with something in them are shown.
export function eventBriefSlackMessage(input: {
  plan_title: string; days_to_start: number; headline: string; progress: { done: number; total: number; percent: number };
  blockers: BriefItem[]; overdue: BriefItem[]; due_soon: BriefItem[]; your_todos: BriefItem[]; suggestions: string[]; url: string;
}) {
  const countdown = input.days_to_start > 0 ? `${input.days_to_start} days to go` : input.days_to_start === 0 ? "Starts today" : "Event under way or done";
  const section = (title: string, items: BriefItem[]) => items.length ? [`*${title}*`, ...items.slice(0, 8).map(briefLine)] : [];
  return [
    `:spiral_calendar_pad: *${escapeSlack(input.plan_title)}* · ${countdown} · ${input.progress.done}/${input.progress.total} done (${input.progress.percent}%)`,
    escapeSlack(input.headline),
    ...section(":red_circle: Blockers", input.blockers),
    ...section(":warning: Overdue", input.overdue),
    ...section(":alarm_clock: Due in the next 3 days", input.due_soon),
    ...section(":bust_in_silhouette: Your to-dos", input.your_todos),
    ...(input.suggestions.length ? ["*Suggestions*", ...input.suggestions.slice(0, 5).map((text) => `• ${escapeSlack(text)}`)] : []),
    `<${input.url}|Open the event board>`,
  ].join("\n");
}
