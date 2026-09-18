import type { NextRequest } from "next/server";
import { approvalDecisionSchema } from "@/lib/ai-workspace/schemas";
import { aiActor, aiAdmin, aiError, sameOrigin } from "@/lib/ai-workspace/server";
import { signAiPayload } from "@/lib/ai-workspace/signatures";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ approvalId: string }> }) {
  if (!sameOrigin(request)) return aiError("Invalid origin.", 403);
  const actor = await aiActor(request);
  if (!actor || actor.role !== "owner") return aiError("Owner approval is required.", 403);
  const parsed = approvalDecisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return aiError("Invalid decision.", 400);
  const { approvalId } = await params;
  const admin = aiAdmin();
  const { data: approval } = await admin.from("ai_approvals").select("*").eq("id", approvalId).maybeSingle();
  if (!approval) return aiError("Approval not found.", 404);
  const { data: decisionResult, error } = await admin.rpc("ai_decide_approval", { p_approval_id: approvalId, p_actor_id: actor.id,
    p_decision: parsed.data.decision, p_comment: parsed.data.comment, p_idempotency_key: parsed.data.idempotency_key });
  if (error) return aiError("Could not save approval decision.", 500);
  if (decisionResult?.duplicate && approval.status !== parsed.data.decision) return aiError("Approval already has a different decision.", 409);
  if (decisionResult?.duplicate && approval.resume_status === "sent") return Response.json({ approval, duplicate: true });
  const base = process.env.N8N_WEBHOOK_BASE_URL;
  const secret = process.env.N8N_PORTAL_SHARED_SECRET;
  if (base && secret && secret.length >= 32) {
    try {
      const endpoint = new URL(`${base.replace(/\/$/, "")}/ai-approval-decision`);
      if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost") throw new Error("HTTPS required.");
      const body = JSON.stringify({ schema_version: 1, approval_id: approvalId, task_id: approval.task_id,
        run_id: approval.run_id, correlation_id: approval.correlation_id, idempotency_key: `${approvalId}:decision:${parsed.data.decision}`,
        decision: parsed.data.decision, comment: parsed.data.comment, action_type: approval.action_type,
        downstream_action: approval.downstream_action });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "x-ai-timestamp": timestamp,
        "x-ai-signature": signAiPayload(secret, timestamp, body) }, body, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`n8n returned ${response.status}`);
      await admin.from("ai_approvals").update({ resume_status: "sent", resume_error: null }).eq("id", approvalId);
    } catch {
      await admin.from("ai_approvals").update({ resume_status: "failed", resume_error: "Could not notify n8n; manual retry is required." }).eq("id", approvalId);
    }
  } else {
    await admin.from("ai_approvals").update({ resume_status: "failed", resume_error: "n8n is not configured; retry the decision after setup." }).eq("id", approvalId);
  }
  const { data: updated } = await admin.from("ai_approvals").select("*").eq("id", approvalId).single();
  return Response.json({ approval: updated });
}
