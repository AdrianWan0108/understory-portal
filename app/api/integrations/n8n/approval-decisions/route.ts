import type { NextRequest } from "next/server";
import { z } from "zod";
import { uuidSchema } from "@/lib/ai-workspace/schemas";
import { aiAdmin, aiError } from "@/lib/ai-workspace/server";
import { verifyAiPayload } from "@/lib/ai-workspace/signatures";

export const runtime = "nodejs";

const decisionSchema = z.object({ schema_version: z.literal(1), approval_id: uuidSchema, slack_user_id: z.string().min(1),
  decision: z.enum(["approved", "changes_requested", "rejected"]), comment: z.string().max(3000).default(""), idempotency_key: z.string().min(16) });

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyAiPayload({ secret: process.env.N8N_PORTAL_SHARED_SECRET ?? "", timestamp: request.headers.get("x-ai-timestamp"),
    signature: request.headers.get("x-ai-signature"), body: raw })) return aiError("Invalid integration signature.", 401);
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return aiError("Invalid JSON.", 400); }
  const parsed = decisionSchema.safeParse(payload);
  if (!parsed.success) return aiError("Invalid decision.", 400);
  const input = parsed.data;
  const admin = aiAdmin();
  const { data: actor } = await admin.from("profiles").select("id, role").eq("slack_user_id", input.slack_user_id).maybeSingle();
  if (!actor || actor.role !== "owner") return aiError("Slack user is not an authorized owner.", 403);
  const { data, error } = await admin.rpc("ai_decide_approval", { p_approval_id: input.approval_id, p_actor_id: actor.id,
    p_decision: input.decision, p_comment: input.comment, p_idempotency_key: input.idempotency_key });
  if (error) return aiError("Could not record decision.", 500);
  if (data?.duplicate && data.status !== input.decision) return aiError("Approval already has another decision.", 409);
  return Response.json(data);
}
