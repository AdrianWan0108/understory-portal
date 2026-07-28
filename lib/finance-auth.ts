import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  evaluateFinanceAccess,
  type FinanceAccessState,
} from "@/lib/finance-policy";

export const FINANCE_SESSION_COOKIE = "understory_finance_session";
const FINANCE_SESSION_SECONDS = 8 * 60 * 60;

type ProfileRow = {
  id: string;
  full_name: string;
  can_view_finance: boolean;
};

export type FinancePrincipal = Extract<
  FinanceAccessState,
  { kind: "allowed" }
>;

export type FinanceAuthResult =
  | { ok: true; principal: FinancePrincipal }
  | { ok: false; status: 401 | 403 | 500; error: string };

function sessionHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function authError(state: FinanceAccessState): FinanceAuthResult {
  if (state.kind === "forbidden") {
    return {
      ok: false,
      status: 403,
      error: "Finance access is restricted.",
    };
  }
  return {
    ok: false,
    status: 401,
    error: "A secure Finance sign-in is required.",
  };
}

export async function financeAccessForSessionToken(
  token: string | null | undefined,
): Promise<FinanceAuthResult> {
  if (!token) return authError({ kind: "unauthenticated" });

  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      ok: false,
      status: 500,
      error: "Finance authentication is not configured.",
    };
  }

  const { data: session, error: sessionError } = await admin
    .from("finance_sessions")
    .select("user_id, expires_at")
    .eq("session_hash", sessionHash(token))
    .maybeSingle();

  if (sessionError) {
    return {
      ok: false,
      status: 500,
      error: "Finance authentication is unavailable.",
    };
  }

  let profile: ProfileRow | null = null;
  if (session?.user_id) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, full_name, can_view_finance")
      .eq("user_id", session.user_id)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        status: 500,
        error: "Finance authorization is unavailable.",
      };
    }
    profile = data as ProfileRow | null;
  }

  const state = evaluateFinanceAccess({
    sessionUserId: session?.user_id,
    sessionExpiresAt: session?.expires_at,
    profile,
  });

  if (state.kind !== "allowed") return authError(state);
  return { ok: true, principal: state };
}

export function requireFinanceAccess(request: NextRequest) {
  return financeAccessForSessionToken(
    request.cookies.get(FINANCE_SESSION_COOKIE)?.value,
  );
}

export async function requireFinancePageAccess() {
  const cookieStore = await cookies();
  return financeAccessForSessionToken(
    cookieStore.get(FINANCE_SESSION_COOKIE)?.value,
  );
}

export function isTrustedMutationOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const configuredOrigin = process.env.FRONTEND_URL;
  const expectedOrigin = configuredOrigin
    ? new URL(configuredOrigin).origin
    : request.nextUrl.origin;

  return origin === expectedOrigin;
}

export async function createFinanceSessionForVerifiedUser(userId: string) {
  const admin = getSupabaseAdmin();

  if (!admin) {
    return {
      ok: false as const,
      status: 500 as const,
      error: "Finance authentication is not configured.",
    };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, can_view_finance")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false as const,
      status: 500 as const,
      error: "Finance authorization is unavailable.",
    };
  }
  if (!profile?.can_view_finance) {
    return {
      ok: false as const,
      status: 403 as const,
      error: "This account does not have Finance access.",
    };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + FINANCE_SESSION_SECONDS * 1000,
  ).toISOString();
  const { error: insertError } = await admin.from("finance_sessions").insert({
    session_hash: sessionHash(token),
    user_id: userId,
    expires_at: expiresAt,
  });

  if (insertError) {
    return {
      ok: false as const,
      status: 500 as const,
      error: "Could not create the Finance session.",
    };
  }

  return {
    ok: true as const,
    token,
    expiresAt,
    principal: {
      kind: "allowed" as const,
      userId,
      profileId: profile.id,
      name: profile.full_name,
    },
  };
}

export function setFinanceSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: string,
) {
  response.cookies.set(FINANCE_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
    priority: "high",
  });
}

export async function revokeFinanceSession(
  token: string | null | undefined,
) {
  if (!token) return;
  const admin = getSupabaseAdmin();
  if (!admin) return;
  await admin
    .from("finance_sessions")
    .delete()
    .eq("session_hash", sessionHash(token));
}

export function clearFinanceSessionCookie(response: NextResponse) {
  response.cookies.set(FINANCE_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
