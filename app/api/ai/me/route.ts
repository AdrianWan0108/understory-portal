import type { NextRequest } from "next/server";
import { aiActor, aiError } from "@/lib/ai-workspace/server";

export async function GET(request: NextRequest) {
  const actor = await aiActor(request);
  if (!actor) return aiError("A linked Understory Supabase account is required.", 401);
  return Response.json({ actor });
}
