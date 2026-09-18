import type { NextRequest } from "next/server";
import { z } from "zod";
import { agentKeySchema, providerSchema } from "@/lib/ai-workspace/schemas";
import { aiActor, aiAdmin, aiError, sameOrigin } from "@/lib/ai-workspace/server";
import { HIGH_RISK_ACTIONS } from "@/lib/ai-workspace/policy";

const providerModel = z.object({ provider: providerSchema, model: z.string().min(1).max(150) });
const routeStage = providerModel.extend({ when: z.string().max(200).optional(), fallback: providerModel.optional() });
const configSchema = z.object({ agent_key: agentKeySchema, enabled: z.boolean().optional(),
  provider_routes: z.record(z.string(), routeStage).optional(), allowed_tools: z.array(z.string().min(1).max(80)).max(30).optional(),
  allowed_actions: z.array(z.string().refine((value) => HIGH_RISK_ACTIONS.has(value))).max(30).optional(),
  permitted_client_ids: z.array(z.uuid()).optional(), permitted_project_ids: z.array(z.uuid()).optional(),
  approval_policy: z.string().min(1).max(500).optional(), provider_limits: z.record(providerSchema, z.number().nonnegative()).optional(),
  agent_limit_usd: z.number().nonnegative().nullable().optional(), slack_channel_id: z.string().max(100).nullable().optional(),
  schedule_config: z.record(z.string(), z.unknown()).optional(), context_sources: z.array(z.object({ label: z.string(), url: z.url() })).optional(),
});

export async function GET(request: NextRequest) {
  const actor = await aiActor(request);
  if (!actor || actor.role !== "owner") return aiError("Owner access is required.", 403);
  const admin = aiAdmin();
  const [agents, configs] = await Promise.all([
    admin.from("ai_agents").select("key, name, responsibility, visual_key").order("name"),
    admin.from("ai_agent_configs").select("*").order("agent_key"),
  ]);
  if (agents.error || configs.error) return aiError("Could not load agents.", 500);
  return Response.json({ agents: agents.data ?? [], configs: configs.data ?? [] });
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return aiError("Invalid origin.", 403);
  const actor = await aiActor(request);
  if (!actor || actor.role !== "owner") return aiError("Owner access is required.", 403);
  const parsed = configSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return aiError("Invalid agent configuration.", 400);
  const { agent_key, ...patch } = parsed.data;
  if (Object.keys(patch).length === 0) return aiError("No changes supplied.", 400);
  const admin = aiAdmin();
  const { data, error } = await admin.from("ai_agent_configs").update({ ...patch, updated_at: new Date().toISOString() }).eq("agent_key", agent_key).select("*").single();
  if (error) return aiError("Could not save agent configuration.", 500);
  return Response.json({ config: data });
}
