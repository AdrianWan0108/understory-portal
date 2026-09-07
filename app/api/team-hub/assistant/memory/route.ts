import type { NextRequest } from "next/server";
import {
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
  getTeamMemberIdentityForUsername,
} from "@/lib/team-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const MEMORY_CATEGORIES = [
  "brand_voice",
  "audience",
  "content_style",
  "winning_idea",
  "avoid",
  "fact",
] as const;

type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

function callerFromRequest(request: NextRequest) {
  const identity = getTeamMemberIdentityForUsername(
    request.cookies.get(TEAM_SESSION_COOKIE)?.value,
  );
  return identity ? TEAM_IDENTITIES[identity] : null;
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function isMemoryCategory(value: unknown): value is MemoryCategory {
  return (
    typeof value === "string" &&
    (MEMORY_CATEGORIES as readonly string[]).includes(value)
  );
}

export async function GET(request: NextRequest) {
  if (!callerFromRequest(request)) return jsonError("Sign in to view memory.", 401);
  const clientId = request.nextUrl.searchParams.get("clientId")?.trim();
  if (!clientId) return jsonError("clientId is required.", 422);

  const admin = getSupabaseAdmin();
  if (!admin) return jsonError("Assistant storage is not configured.", 500);
  const { data, error } = await admin
    .from("assistant_memories")
    .select("id, client_id, category, content, created_by, created_at, updated_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) return jsonError(error.message, 500);
  return Response.json({ memories: data ?? [] });
}

export async function POST(request: NextRequest) {
  const caller = callerFromRequest(request);
  if (!caller) return jsonError("Sign in to add memory.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }
  if (!body || typeof body !== "object") return jsonError("Invalid request body.", 400);

  const payload = body as Record<string, unknown>;
  const clientId = typeof payload.clientId === "string" ? payload.clientId.trim() : "";
  const content = typeof payload.content === "string" ? payload.content.trim() : "";
  if (!clientId) return jsonError("clientId is required.", 422);
  if (!isMemoryCategory(payload.category)) return jsonError("Choose a valid memory category.", 422);
  if (!content || content.length > 1000) {
    return jsonError("Memory must be between 1 and 1000 characters.", 422);
  }

  const admin = getSupabaseAdmin();
  if (!admin) return jsonError("Assistant storage is not configured.", 500);
  const { data, error } = await admin
    .from("assistant_memories")
    .insert({
      client_id: clientId,
      category: payload.category,
      content,
      created_by: caller.username,
    })
    .select("id, client_id, category, content, created_by, created_at, updated_at")
    .single();
  if (error || !data) return jsonError(error?.message ?? "Could not save memory.", 500);
  return Response.json({ memory: data }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  if (!callerFromRequest(request)) return jsonError("Sign in to delete memory.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }
  const id =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).id === "string"
      ? ((body as Record<string, unknown>).id as string)
      : "";
  if (!id) return jsonError("Memory id is required.", 422);

  const admin = getSupabaseAdmin();
  if (!admin) return jsonError("Assistant storage is not configured.", 500);
  const { error } = await admin.from("assistant_memories").delete().eq("id", id);
  if (error) return jsonError(error.message, 500);
  return new Response(null, { status: 204 });
}
