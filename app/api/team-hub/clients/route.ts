import type { NextRequest } from "next/server";
import {
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
  getTeamIdentityForUsername,
} from "@/lib/team-auth";
import {
  ClientInputError,
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
