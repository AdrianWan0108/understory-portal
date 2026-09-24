import { z } from "zod";

export const agentKeySchema = z.enum(["operations", "content", "research", "creative", "growth"]);
export const providerSchema = z.enum(["anthropic", "openai", "perplexity", "worker"]);
export const taskStatusSchema = z.enum(["queued", "running", "waiting_for_input", "waiting_for_approval", "completed", "failed", "cancelled"]);
export const runStatusSchema = z.enum(["queued", "running", "completed", "failed", "partial", "refused", "timed_out"]);
export const triggerSourceSchema = z.enum(["portal", "slack", "schedule", "webhook", "system_event"]);
export const riskLevelSchema = z.enum(["low", "medium", "high"]);
export const uuidSchema = z.uuid();

const version = z.literal(1);
const reference = z.object({ type: z.string().min(1).max(60), id: z.string().min(1).max(300), title: z.string().max(300).optional(), url: z.url().optional() });
const source = z.object({ title: z.string().min(1), url: z.url(), accessed_at: z.iso.datetime().optional(), note: z.string().optional() });

export const extractedProjectTaskSchema = z.object({
  schema_version: version, kind: z.literal("project_task"), title: z.string().min(1), description: z.string().min(1),
  owner: z.string().nullable(), due_date: z.iso.date().nullable(), priority: z.enum(["low", "normal", "high", "urgent"]),
  source_references: z.array(reference), scope_risk: z.string().nullable(),
});
export const contentSuggestionSchema = z.object({
  schema_version: version, kind: z.literal("content_suggestion"), title: z.string().min(1), format: z.enum(["reel", "carousel", "image", "other"]),
  purpose: z.string(), hook: z.string(), caption: z.string(), bilingual_variations: z.array(z.object({ language: z.string(), text: z.string() })),
  creative_brief: z.string(), production_due_date: z.iso.date().nullable(), publication_date: z.iso.date().nullable(),
  source_references: z.array(source),
});
export const researchResultSchema = z.object({
  schema_version: version, kind: z.literal("research_result"), question: z.string().min(1), summary: z.string().min(1),
  findings: z.array(z.object({ claim: z.string().min(1), source_urls: z.array(z.url()), confidence: z.enum(["low", "medium", "high"]) })),
  sources: z.array(source), uncertainty: z.string(), opportunities: z.array(z.string()),
});
export const creativeBriefSchema = z.object({
  schema_version: version, kind: z.literal("creative_brief"), concept: z.string().min(1), objective: z.string().min(1),
  audience: z.string(), hierarchy: z.array(z.string()), asset_requirements: z.array(z.string()), accessibility_notes: z.array(z.string()),
  image_prompts: z.array(z.string()), figma_file_url: z.url().nullable(), figma_frame_url: z.url().nullable(),
  delivery_status: z.enum(["concept_only", "manual_link", "worker_pending", "worker_delivered"]),
});
export const analyticsInsightSchema = z.object({
  schema_version: version, kind: z.literal("analytics_insight"), metric_period: z.object({ start: z.iso.date(), end: z.iso.date() }),
  metric_references: z.array(reference), interpretation: z.string().min(1), limitations: z.array(z.string()),
  recommended_actions: z.array(z.object({ title: z.string(), rationale: z.string(), priority: z.enum(["low", "normal", "high", "urgent"]), approval_required: z.boolean() })),
  external_context: z.array(source),
});
export const operationsResultSchema = z.object({
  schema_version: version, kind: z.literal("operations_result"), summary: z.string().min(1),
  recommended_actions: z.array(z.object({
    title: z.string().min(1), rationale: z.string().min(1),
    priority: z.enum(["low", "normal", "high", "urgent"]), approval_required: z.boolean(),
  })),
  risks: z.array(z.object({ description: z.string().min(1), severity: z.enum(["low", "medium", "high"]) })),
  questions: z.array(z.string().min(1)),
});
export const slackAgentResponseSchema = z.object({
  schema_version: version, kind: z.literal("slack_response"), task_id: uuidSchema, channel_id: z.string(), thread_ts: z.string().nullable(),
  summary: z.string().min(1).max(1200), portal_deep_link: z.string().startsWith("/team-hub/ai-workspace/tasks/"),
  status: taskStatusSchema,
});
export const approvalRequestSchema = z.object({
  schema_version: version, kind: z.literal("approval_request"), risk_level: riskLevelSchema,
  action_type: z.enum(["other", "client_message", "publish_content", "schedule_content", "promise_deadline", "accept_scope", "change_sow",
    "change_ad_budget", "change_ad_targeting", "change_ad_keyword", "change_ad_creative", "change_ad_campaign", "change_conversion_settings",
    "delete_record", "delete_file", "create_invoice", "create_vendor_bill", "create_payment", "create_refund", "financial_adjustment", "final_client_report"]),
  requested_action: z.string().min(1), downstream_action: z.string().min(1), output_preview: z.string().max(3000),
});

export const structuredOutputSchema = z.discriminatedUnion("kind", [
  extractedProjectTaskSchema, contentSuggestionSchema, researchResultSchema, creativeBriefSchema,
  analyticsInsightSchema, operationsResultSchema, slackAgentResponseSchema, approvalRequestSchema,
]);

export const createAiTaskSchema = z.object({
  agent: agentKeySchema, title: z.string().trim().min(1).max(200), objective: z.string().trim().min(1).max(10000),
  client_id: uuidSchema.nullable().optional(), project_id: uuidSchema.nullable().optional(), content_item_id: uuidSchema.nullable().optional(),
  assigned_profile_id: uuidSchema.nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  input_payload: z.record(z.string(), z.unknown()).default({}), context_references: z.array(reference).default([]),
  idempotency_key: z.string().min(16).max(200),
});

export const taskEventSchema = z.object({
  schema_version: version, event_id: uuidSchema, task_id: uuidSchema, run_id: uuidSchema, correlation_id: uuidSchema,
  idempotency_key: z.string().min(16), workflow_execution_id: z.string().max(300).optional(),
  trigger_source: triggerSourceSchema, status: runStatusSchema, stage: z.string().max(100).optional(),
  summary: z.string().max(1200), error_message: z.string().max(2000).optional(),
  decision_summary: z.string().max(2000).optional(), tool_actions: z.array(z.object({ name: z.string(), summary: z.string(), result: z.enum(["success", "failed", "skipped"]) })).default([]),
  input_references: z.array(reference).optional(),
  provider: providerSchema.optional(), model: z.string().max(150).optional(),
  usage: z.object({ input_tokens: z.number().int().nonnegative().nullable(), output_tokens: z.number().int().nonnegative().nullable(), credits: z.number().nonnegative().nullable(), cost_usd: z.number().nonnegative().nullable() }).optional(),
  output: structuredOutputSchema.optional(), approval: approvalRequestSchema.optional(),
  slack: z.object({ channel_id: z.string(), thread_ts: z.string().optional(), message_ts: z.string().optional(), user_id: z.string().optional(), permalink: z.url().optional() }).optional(),
  latency_ms: z.number().int().nonnegative().optional(),
});

export const approvalDecisionSchema = z.object({ decision: z.enum(["approved", "changes_requested", "rejected"]), comment: z.string().trim().max(3000).default(""), idempotency_key: z.string().min(16).max(200) });

export type AiAgentKey = z.infer<typeof agentKeySchema>;
export type AiTaskStatus = z.infer<typeof taskStatusSchema>;
