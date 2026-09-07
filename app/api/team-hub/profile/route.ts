import type { NextRequest } from "next/server";
import {
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
  getTeamMemberIdentityForUsername,
} from "@/lib/team-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type ProfileRow = {
  team_username: string;
  full_name: string;
  email: string | null;
  title: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function callerFromRequest(request: NextRequest) {
  const identity = getTeamMemberIdentityForUsername(
    request.cookies.get(TEAM_SESSION_COOKIE)?.value,
  );
  if (!identity) return null;
  return TEAM_IDENTITIES[identity];
}

export async function GET(request: NextRequest) {
  const caller = callerFromRequest(request);
  if (!caller) return jsonError("Sign in to view profiles.", 401);

  const wantsAll = request.nextUrl.searchParams.get("all") === "1";
  if (wantsAll && caller.accessLevel !== "owner") {
    return jsonError("Owner access is required.", 403);
  }

  const admin = getSupabaseAdmin();
  if (!admin) return jsonError("Profile storage is not configured.", 500);

  if (wantsAll) {
    const { data, error } = await admin
      .from("profiles")
      .select("team_username, full_name, email, title")
      .not("team_username", "is", null)
      .order("full_name", { ascending: true });

    if (error) return jsonError(error.message, 500);
    return Response.json({ profiles: (data ?? []) as ProfileRow[] });
  }

  const { data, error } = await admin
    .from("profiles")
    .select("team_username, full_name, email, title")
    .eq("team_username", caller.username)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Profile not found.", 404);

  return Response.json({ profile: data as ProfileRow });
}

export async function PATCH(request: NextRequest) {
  const caller = callerFromRequest(request);
  if (!caller) return jsonError("Sign in to edit profiles.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  if (typeof body !== "object" || body === null) {
    return jsonError("Invalid request body.", 400);
  }

  const payload = body as Record<string, unknown>;
  const targetUsername =
    typeof payload.team_username === "string" && payload.team_username.trim()
      ? payload.team_username.trim()
      : caller.username;

  if (
    targetUsername !== caller.username &&
    caller.accessLevel !== "owner"
  ) {
    return jsonError("You can only edit your own profile.", 403);
  }

  const admin = getSupabaseAdmin();
  if (!admin) return jsonError("Profile storage is not configured.", 500);

  const fullName =
    typeof payload.full_name === "string" ? payload.full_name.trim() : "";
  const email =
    typeof payload.email === "string" ? payload.email.trim() : "";
  const titleRaw =
    typeof payload.title === "string" ? payload.title.trim() : "";

  if (!fullName) {
    return jsonError("Full name is required.", 422);
  }
  if (!EMAIL_PATTERN.test(email)) {
    return jsonError("Enter a valid email address.", 422);
  }

  // Allowlisted on purpose: avatar_url, slack_display_name, slack_user_id,
  // slack_synced_at, role, team_username, id, user_id, and created_at are
  // never accepted from this code path, even for owners editing others.
  const { data, error } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      email,
      title: titleRaw || null,
    })
    .eq("team_username", targetUsername)
    .select("team_username, full_name, email, title")
    .maybeSingle();

  if (error) {
    const message = error.code === "23505"
      ? "That email is already in use by another profile."
      : error.message;
    return jsonError(message, error.code === "23505" ? 409 : 500);
  }
  if (!data) return jsonError("Profile not found.", 404);

  return Response.json({ profile: data as ProfileRow });
}
