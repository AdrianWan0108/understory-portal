import type { NextRequest } from "next/server";
import { aiActor, aiAdmin, aiError, sameOrigin } from "@/lib/ai-workspace/server";
import { eventItemUpdateSchema, uuidSchema } from "@/lib/ai-workspace/schemas";
import { EVENT_ITEM_SELECT } from "@/lib/ai-workspace/event-board";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  if (!sameOrigin(request)) return aiError("Invalid origin.", 403);
  const actor = await aiActor(request);
  if (!actor || actor.role !== "owner") return aiError("Owner access is required.", 403);
  const { itemId } = await params;
  if (!uuidSchema.safeParse(itemId).success) return aiError("Event item not found.", 404);
  const parsed = eventItemUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return aiError("Invalid event item change.", 400);
  const patch: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };
  if (parsed.data.status) patch.completed_at = parsed.data.status === "done" ? new Date().toISOString() : null;
  // An item that is no longer blocked should not keep showing its old blocker.
  if (parsed.data.status && parsed.data.status !== "blocked" && parsed.data.blocker === undefined) patch.blocker = null;
  const { data, error } = await aiAdmin().from("event_plan_items").update(patch).eq("id", itemId).select(EVENT_ITEM_SELECT).maybeSingle();
  if (error) return aiError("Could not update the event item.", 500);
  if (!data) return aiError("Event item not found.", 404);
  return Response.json({ item: data });
}
