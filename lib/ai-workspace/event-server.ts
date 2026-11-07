import "server-only";

import { aiAdmin } from "./server";
import { eventBriefSchema, type EventBrief } from "./schemas";
import {
  EVENT_ITEM_SELECT,
  EVENT_PLAN_SELECT,
  summarizeEventPlan,
  type EventBoardSummary,
  type EventItemRecord,
  type EventPlanRecord,
} from "./event-board";

export type EventBoard = {
  plan: EventPlanRecord;
  items: EventItemRecord[];
  summary: EventBoardSummary;
  latest_brief: { task_id: string; completed_at: string | null; brief: EventBrief } | null;
};

/** Planning and live plans (or every plan when `all`), with items, summary and the latest Event Planner brief. */
export async function loadEventBoards(options: { me?: string[]; all?: boolean } = {}): Promise<EventBoard[]> {
  const admin = aiAdmin();
  let planQuery = admin.from("event_plans").select(EVENT_PLAN_SELECT).order("start_date", { ascending: true }).limit(20);
  if (!options.all) planQuery = planQuery.in("status", ["planning", "live"]);
  const { data: planRows, error: planError } = await planQuery;
  if (planError) throw new Error("Could not read event plans.");
  const plans = (planRows ?? []) as EventPlanRecord[];
  if (!plans.length) return [];
  const ids = plans.map((plan) => plan.id);
  const [itemResult, briefResult] = await Promise.all([
    admin.from("event_plan_items").select(EVENT_ITEM_SELECT).in("plan_id", ids).order("sort_order", { ascending: true }),
    admin.from("ai_tasks").select("id, completed_at, structured_output").eq("assigned_agent", "events").eq("status", "completed")
      .eq("structured_output->>kind", "event_brief").order("completed_at", { ascending: false, nullsFirst: false }).limit(30),
  ]);
  if (itemResult.error) throw new Error("Could not read event plan items.");
  const items = (itemResult.data ?? []) as EventItemRecord[];
  const briefs = (briefResult.data ?? []).flatMap((row) => {
    const parsed = eventBriefSchema.safeParse(row.structured_output);
    return parsed.success ? [{ task_id: row.id as string, completed_at: row.completed_at as string | null, brief: parsed.data }] : [];
  });
  return plans.map((plan) => {
    const planItems = items.filter((item) => item.plan_id === plan.id);
    return {
      plan,
      items: planItems,
      summary: summarizeEventPlan(plan, planItems, { me: options.me }),
      latest_brief: briefs.find((entry) => entry.brief.plan_id === plan.id) ?? null,
    };
  });
}
