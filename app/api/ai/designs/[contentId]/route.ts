import type { NextRequest } from "next/server";
import { z } from "zod";
import { aiActor, aiAdmin, aiError, sameOrigin } from "@/lib/ai-workspace/server";

const designSchema = z.object({ design_status: z.enum(["not_started", "ai_designing", "ai_draft_ready", "human_editing", "internal_review", "revisions", "client_review", "approved", "exported"]).optional(),
  figma_file_url: z.url().nullable().optional(), figma_frame_url: z.url().nullable().optional(), template_used: z.string().max(300).nullable().optional(),
  asset_requirements: z.array(z.string()).optional(), internal_design_feedback: z.string().max(5000).nullable().optional() });

export async function GET(request: NextRequest, { params }: { params: Promise<{ contentId: string }> }) {
  const actor = await aiActor(request);
  if (!actor || actor.role !== "owner") return aiError("Owner access is required.", 403);
  const { contentId } = await params;
  const { data, error } = await aiAdmin().from("ai_content_designs").select("*").eq("content_item_id", contentId).maybeSingle();
  if (error) return aiError("Could not load design.", 500);
  return Response.json({ design: data });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ contentId: string }> }) {
  if (!sameOrigin(request)) return aiError("Invalid origin.", 403);
  const actor = await aiActor(request);
  if (!actor || actor.role !== "owner") return aiError("Owner access is required.", 403);
  const parsed = designSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return aiError("Invalid design update.", 400);
  const { contentId } = await params;
  const admin = aiAdmin();
  const { data: content } = await admin.from("tasks").select("id").eq("id", contentId).maybeSingle();
  if (!content) return aiError("Content item not found.", 404);
  const { data: prior } = await admin.from("ai_content_designs").select("design_version").eq("content_item_id", contentId).maybeSingle();
  const { data, error } = await admin.from("ai_content_designs").upsert({ content_item_id: contentId, ...parsed.data,
    design_version: (prior?.design_version ?? 0) + 1, updated_at: new Date().toISOString(),
    ...(parsed.data.design_status === "approved" ? { design_approved_by: actor.id, design_approved_at: new Date().toISOString() }
      : parsed.data.design_status ? { design_approved_by: null, design_approved_at: null } : {}) },
  { onConflict: "content_item_id" }).select("*").single();
  if (error) return aiError("Could not save design.", 500);
  return Response.json({ design: data });
}
