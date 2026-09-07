import type { NextRequest } from "next/server";
import {
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
  getTeamIdentityForUsername,
  getTeamMemberIdentityForUsername,
} from "@/lib/team-auth";
import {
  ClientInputError,
  validateClientName,
  validateNewClientInput,
} from "@/lib/client-management";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isTrustedMutationOrigin } from "@/lib/finance-auth";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  if (!isTrustedMutationOrigin(request)) {
    return jsonError("Invalid request origin.", 403);
  }

  const identity = getTeamIdentityForUsername(
    request.cookies.get(TEAM_SESSION_COOKIE)?.value,
  );
  if (!identity || TEAM_IDENTITIES[identity].accessLevel !== "owner") {
    return jsonError("Owner access is required to add a client.", 403);
  }

  let input;
  try {
    input = validateNewClientInput(await request.json());
  } catch (caught) {
    return jsonError(
      caught instanceof ClientInputError
        ? caught.message
        : "Invalid request body.",
      422,
    );
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return jsonError("Client storage is not configured.", 503);
  }

  const { data: existing, error: lookupError } = await admin
    .from("clients")
    .select("id, name, slug")
    .eq("slug", input.slug)
    .maybeSingle();

  if (lookupError) return jsonError(lookupError.message, 500);
  if (existing) {
    return jsonError("That client URL slug is already in use.", 409);
  }

  const { data, error } = await admin
    .from("clients")
    .insert({ name: input.name, slug: input.slug })
    .select("id, name, slug, logo_url")
    .single();

  if (error) {
    return jsonError(
      error.code === "23505"
        ? "A client with that name or URL slug already exists."
        : error.message,
      error.code === "23505" ? 409 : 500,
    );
  }

  return Response.json({ client: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  if (!isTrustedMutationOrigin(request)) {
    return jsonError("Invalid request origin.", 403);
  }

  const identity = getTeamMemberIdentityForUsername(
    request.cookies.get(TEAM_SESSION_COOKIE)?.value,
  );
  if (!identity) {
    return jsonError("Team member access is required to rename a client.", 403);
  }

  let body: Record<string, unknown>;
  let name: string;
  try {
    body = (await request.json()) as Record<string, unknown>;
    name = validateClientName(body.name);
  } catch (caught) {
    return jsonError(
      caught instanceof ClientInputError
        ? caught.message
        : "Invalid request body.",
      422,
    );
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return jsonError("A valid client ID is required.", 422);
  }

  const admin = getSupabaseAdmin();
  if (!admin) return jsonError("Client storage is not configured.", 503);

  const { data, error } = await admin
    .from("clients")
    .update({ name })
    .eq("id", id)
    .select("id, name, slug, logo_url")
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Client not found.", 404);
  return Response.json({ client: data });
}
