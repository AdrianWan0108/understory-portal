import type { NextRequest } from "next/server";
import { aiActor, aiAdmin, aiError, sameOrigin } from "@/lib/ai-workspace/server";
import { eventItemCreateSchema } from "@/lib/ai-workspace/schemas";
import { EVENT_ITEM_SELECT } from "@/lib/ai-workspace/event-board";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return aiError("Invalid origin.", 403);
  const actor = await aiActor(request);
  if (!actor || actor.role !== "owner") return aiError("Owner access is required.", 403);
  const parsed = eventItemCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return aiError("Invalid event item.", 400);
  const admin = aiAdmin();
  const { data: plan } = await admin.from("event_plans").select("id").eq("id", parsed.data.plan_id).maybeSingle();
  if (!plan) return aiError("Event plan not found.", 404);
  const { data: last } = await admin.from("event_plan_items").select("sort_order").eq("plan_id", plan.id)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin.from("event_plan_items").insert({
    ...parsed.data,
    sort_order: (last?.sort_order ?? 0) + 10,
    completed_at: parsed.data.status === "done" ? new Date().toISOString() : null,
  }).select(EVENT_ITEM_SELECT).single();
  if (error) return aiError("Could not add the event item.", 500);
  return Response.json({ item: data }, { status: 201 });
}
