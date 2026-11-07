// Deterministic event board metrics. The dashboard, the AI Office snapshot and
// the Event Planner tool all use these, so the model only interprets numbers
// it is given and never computes dates or counts itself.

export const EVENT_ITEM_STATUSES = ["todo", "in_progress", "waiting", "blocked", "done", "skipped"] as const;
export const EVENT_ITEM_KINDS = ["task", "decision", "reminder", "milestone"] as const;
export const EVENT_PLAN_STATUSES = ["planning", "live", "wrapped", "cancelled"] as const;

export type EventItemStatus = (typeof EVENT_ITEM_STATUSES)[number];

export type EventPlanRecord = {
  id: string;
  client_id: string | null;
  project_id?: string | null;
  title: string;
  start_date: string;
  end_date: string;
  timezone: string;
  status: string;
  slack_target?: string | null;
  notes?: string | null;
};

export type EventItemRecord = {
  id: string;
  plan_id: string;
  title: string;
  phase: string;
  kind: string;
  owner: string | null;
  due_date: string | null;
  status: string;
  blocker: string | null;
  waiting_on: string | null;
  notes?: string | null;
  sort_order: number;
  completed_at?: string | null;
  updated_at?: string | null;
};

export const EVENT_ITEM_SELECT = "id, plan_id, title, phase, kind, owner, due_date, status, blocker, waiting_on, notes, sort_order, completed_at, updated_at";
export const EVENT_PLAN_SELECT = "id, client_id, project_id, title, start_date, end_date, timezone, status, slack_target, notes";

export const SOON_DAYS = 3;

const CLOSED = new Set(["done", "skipped"]);
export const isOpenItem = (item: Pick<EventItemRecord, "status">) => !CLOSED.has(item.status);

/** Today's date (YYYY-MM-DD) in the plan's time zone. */
export function todayIn(timeZone: string, now: Date = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** True when an item's owner is the viewer. Matches the full name or the first name, ignoring case. */
export function ownerMatches(owner: string | null, names: string[]) {
  if (!owner) return false;
  const value = owner.trim().toLowerCase();
  return names.some((name) => {
    const full = name.trim().toLowerCase();
    if (!full) return false;
    return value === full || value === full.split(/\s+/)[0];
  });
}

function byDue(a: EventItemRecord, b: EventItemRecord) {
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  return a.sort_order - b.sort_order;
}

export type EventBoardSummary = {
  plan_id: string;
  title: string;
  today: string;
  start_date: string;
  end_date: string;
  days_to_start: number;
  stage: "before" | "live" | "after";
  progress: { done: number; total: number; percent: number };
  phases: Array<{ phase: string; done: number; total: number }>;
  blocked: EventItemRecord[];
  waiting: EventItemRecord[];
  overdue: EventItemRecord[];
  due_soon: EventItemRecord[];
  my_todos: EventItemRecord[];
  next_up: EventItemRecord[];
};

export function summarizeEventPlan(plan: EventPlanRecord, items: EventItemRecord[], options: { today?: string; me?: string[] } = {}): EventBoardSummary {
  const today = options.today ?? todayIn(plan.timezone);
  const mine = items.filter((item) => item.plan_id === plan.id);
  const counted = mine.filter((item) => item.status !== "skipped");
  const done = counted.filter((item) => item.status === "done").length;
  const open = mine.filter(isOpenItem).sort(byDue);
  const soonLimit = addDays(today, SOON_DAYS);
  const phaseMap = new Map<string, { phase: string; done: number; total: number; order: number }>();
  for (const item of counted) {
    const entry = phaseMap.get(item.phase) ?? { phase: item.phase, done: 0, total: 0, order: item.sort_order };
    entry.total += 1;
    if (item.status === "done") entry.done += 1;
    entry.order = Math.min(entry.order, item.sort_order);
    phaseMap.set(item.phase, entry);
  }
  const stage = today < plan.start_date ? "before" : today > plan.end_date ? "after" : "live";
  return {
    plan_id: plan.id,
    title: plan.title,
    today,
    start_date: plan.start_date,
    end_date: plan.end_date,
    days_to_start: daysBetween(today, plan.start_date),
    stage,
    progress: { done, total: counted.length, percent: counted.length ? Math.round((done / counted.length) * 100) : 0 },
    phases: [...phaseMap.values()].sort((a, b) => a.order - b.order).map(({ phase, done: phaseDone, total }) => ({ phase, done: phaseDone, total })),
    blocked: open.filter((item) => item.status === "blocked"),
    waiting: open.filter((item) => item.status === "waiting"),
    overdue: open.filter((item) => item.due_date !== null && item.due_date < today),
    due_soon: open.filter((item) => item.due_date !== null && item.due_date >= today && item.due_date <= soonLimit),
    my_todos: options.me?.length ? open.filter((item) => ownerMatches(item.owner, options.me ?? [])) : [],
    next_up: open.slice(0, 5),
  };
}

/** One-line plain-text item for Slack and the desktop app. */
export function eventItemLine(item: Pick<EventItemRecord, "title" | "due_date" | "owner">) {
  const parts = [item.title];
  if (item.due_date) parts.push(item.due_date.slice(5).replace("-", "/"));
  if (item.owner) parts.push(item.owner);
  return parts.join(" · ");
}

type OfficeItem = { id: string; title: string; owner: string | null; due_date: string | null; status: string; blocker: string | null; waiting_on: string | null };
const officeItem = (item: EventItemRecord): OfficeItem => ({
  id: item.id, title: item.title, owner: item.owner, due_date: item.due_date, status: item.status, blocker: item.blocker, waiting_on: item.waiting_on,
});

/** Event board for the desktop AI Office: counts plus the lists it shows, and each owner's next open items. */
export function officeEventBoard(summary: EventBoardSummary, items: EventItemRecord[]) {
  const owners = new Map<string, EventItemRecord[]>();
  for (const item of items.filter(isOpenItem).sort(byDue)) {
    const owner = item.owner?.trim() || "Unassigned";
    owners.set(owner, [...(owners.get(owner) ?? []), item]);
  }
  return {
    plan_id: summary.plan_id,
    title: summary.title,
    today: summary.today,
    start_date: summary.start_date,
    end_date: summary.end_date,
    days_to_start: summary.days_to_start,
    stage: summary.stage,
    progress: summary.progress,
    phases: summary.phases,
    blocked: summary.blocked.map(officeItem),
    waiting: summary.waiting.map(officeItem),
    overdue: summary.overdue.map(officeItem),
    due_soon: summary.due_soon.map(officeItem),
    owners: [...owners.entries()].map(([owner, list]) => ({ owner, open: list.length, next: list.slice(0, 3).map(officeItem) })),
  };
}
