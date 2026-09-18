import type { NextRequest } from "next/server";
import { aiActor, aiError, sameOrigin } from "@/lib/ai-workspace/server";
import { signAiPayload } from "@/lib/ai-workspace/signatures";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return aiError("Invalid origin.", 403);
  const actor = await aiActor(request);
  if (!actor || actor.role !== "owner") return aiError("Owner access is required.", 403);
  const base = process.env.N8N_WEBHOOK_BASE_URL;
  const secret = process.env.N8N_PORTAL_SHARED_SECRET;
  if (!base || !secret || secret.length < 32) return aiError("n8n is not configured.", 409);
  const endpoint = new URL(`${base.replace(/\/$/, "")}/ai-health`);
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost") return aiError("n8n URL must use HTTPS.", 400);
  const body = JSON.stringify({ schema_version: 1, action: "health_check" });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const started = Date.now();
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "x-ai-timestamp": timestamp,
      "x-ai-signature": signAiPayload(secret, timestamp, body) }, body, signal: AbortSignal.timeout(5000) });
    return Response.json({ reachable: response.ok, status: response.status, latency_ms: Date.now() - started });
  } catch {
    return Response.json({ reachable: false, status: null, latency_ms: Date.now() - started });
  }
}
