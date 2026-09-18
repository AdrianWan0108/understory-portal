import "server-only";

import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { canReadAiTask } from "./policy";

export type AiActor = { id: string; userId: string; role: "owner" | "staff" | "contractor"; teamUsername: string | null; fullName: string };

export function aiAdmin() {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase service role is not configured.");
  return admin;
}

export async function aiActor(request: NextRequest): Promise<AiActor | null> {
  const match = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return null;
  const admin = aiAdmin();
  const { data: auth, error: authError } = await admin.auth.getUser(match[1]);
  if (authError || !auth.user) return null;
  const { data: profile, error } = await admin.from("profiles")
    .select("id, user_id, role, team_username, full_name").eq("user_id", auth.user.id).maybeSingle();
  if (error || !profile || !["owner", "staff", "contractor"].includes(profile.role)) return null;
  return { id: profile.id, userId: auth.user.id, role: profile.role, teamUsername: profile.team_username, fullName: profile.full_name };
}

export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export function aiError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function authorizedAiTask(actor: AiActor, taskId: string) {
  const admin = aiAdmin();
  const { data: task, error } = await admin.from("ai_tasks").select("*").eq("id", taskId).maybeSingle();
  if (error || !task) return null;
  if (actor.role === "owner" || task.assigned_profile_id === actor.id || (actor.role === "staff" && task.requested_by === actor.id)) return task;
  if (actor.role === "contractor" || !actor.teamUsername) return null;
  const [project, content] = await Promise.all([
    task.project_id ? admin.from("division_tasks").select("assignee_usernames, watcher_usernames, mentioned_usernames").eq("id", task.project_id).maybeSingle() : null,
    task.content_item_id ? admin.from("tasks").select("assignee_usernames, watcher_usernames, mentioned_usernames").eq("id", task.content_item_id).maybeSingle() : null,
  ]);
  return canReadAiTask({ role: actor.role, profileId: actor.id, teamUsername: actor.teamUsername, task,
    projectAccess: project?.data, contentAccess: content?.data }) ? task : null;
}

export async function validateTaskLinks(input: { client_id?: string | null; project_id?: string | null; content_item_id?: string | null }) {
  const admin = aiAdmin();
  let clientId = input.client_id ?? null;
  let projectId = input.project_id ?? null;
  if (projectId) {
    const { data } = await admin.from("division_tasks").select("id, client_id").eq("id", projectId).maybeSingle();
    if (!data || (clientId && clientId !== data.client_id)) return null;
    clientId = data.client_id;
  }
  if (input.content_item_id) {
    const { data } = await admin.from("tasks").select("id, client_id, division_task_id").eq("id", input.content_item_id).maybeSingle();
    if (!data || (clientId && clientId !== data.client_id) || (projectId && data.division_task_id !== projectId)) return null;
    clientId = data.client_id;
    projectId = data.division_task_id;
  }
  if (clientId) {
    const { data } = await admin.from("clients").select("id").eq("id", clientId).maybeSingle();
    if (!data) return null;
  }
  return { client_id: clientId, project_id: projectId, content_item_id: input.content_item_id ?? null };
}
