import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { aiActor, aiAdmin, aiError, sameOrigin } from "@/lib/ai-workspace/server";
import { contentSuggestionSchema } from "@/lib/ai-workspace/schemas";

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  if (process.env.NODE_ENV !== "development" || process.env.AI_WORKSPACE_DEMO !== "1") return aiError("Demo mode is disabled.", 404);
  if (!sameOrigin(request)) return aiError("Invalid origin.", 403);
  const actor = await aiActor(request);
  if (!actor || actor.role !== "owner") return aiError("Owner access is required.", 403);
  const { taskId } = await params;
  const admin = aiAdmin();
  const { data: task } = await admin.from("ai_tasks").select("id, title, assigned_agent, status, output_version, correlation_id").eq("id", taskId).maybeSingle();
  if (!task || !["queued", "waiting_for_input"].includes(task.status)) return aiError("Task is not eligible for a demo run.", 409);
  const { data: run } = await admin.from("ai_task_runs").select("id").eq("task_id", taskId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!run) return aiError("Run not found.", 404);
  const output = contentSuggestionSchema.parse({ schema_version: 1, kind: "content_suggestion", title: `Draft for ${task.title}`, format: "other",
    purpose: "Demonstrate a versioned internal draft", hook: "Draft hook for review", caption: "Demo content only. Replace before review.",
    bilingual_variations: [], creative_brief: "Draft concept for internal review.", production_due_date: null, publication_date: null, source_references: [] });
  const now = new Date().toISOString();
  const version = task.output_version + 1;
  await admin.from("ai_task_events").insert({ task_id: taskId, run_id: run.id, event_key: randomUUID(), kind: "output",
    summary: "Development demo produced an internal draft.", metadata: { output, output_version: version, demo: true }, actor_profile_id: actor.id, correlation_id: task.correlation_id });
  await admin.from("ai_task_runs").update({ status: "completed", current_stage: "demo", output_version: version, decision_summary: "Development demo only.", completed_at: now }).eq("id", run.id);
  await admin.from("ai_tasks").update({ status: "completed", current_stage: "demo", output_summary: "Development demo draft. Human review required.",
    structured_output: output, output_schema: output.kind, output_version: version, completed_at: now, updated_at: now }).eq("id", taskId);
  return Response.json({ output_version: version });
}
