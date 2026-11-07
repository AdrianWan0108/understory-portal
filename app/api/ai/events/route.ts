import type { NextRequest } from "next/server";
import { aiActor, aiError } from "@/lib/ai-workspace/server";
import { loadEventBoards } from "@/lib/ai-workspace/event-server";

export const runtime = "nodejs";

// Owner-only event board: plans, items, deterministic summary and the latest
// Event Planner brief. "Your to-dos" match the signed-in owner's name.
export async function GET(request: NextRequest) {
  const actor = await aiActor(request);
  if (!actor || actor.role !== "owner") return aiError("Owner access is required.", 403);
  const all = request.nextUrl.searchParams.get("all") === "1";
  try {
    const boards = await loadEventBoards({ me: [actor.fullName, actor.teamUsername ?? ""].filter(Boolean), all });
    return Response.json({ boards, me: actor.fullName }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    return aiError(caught instanceof Error ? caught.message : "Could not load event plans.", 500);
  }
}
