import type { NextRequest } from "next/server";
import { aiActor, aiError } from "@/lib/ai-workspace/server";

export async function GET(request: NextRequest) {
  const actor = await aiActor(request);
  if (!actor || actor.role !== "owner") return aiError("Owner access is required.", 403);
  return Response.json({ configured: Boolean(process.env.N8N_WEBHOOK_BASE_URL && (process.env.N8N_PORTAL_SHARED_SECRET?.length ?? 0) >= 32),
    slack_configured: Boolean(process.env.SLACK_WEBHOOK_ADMIN), provider_keys_in_portal: false });
}
