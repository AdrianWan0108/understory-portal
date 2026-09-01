import "server-only";

import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  evaluateFinanceAccess,
  type FinanceAccessState,
} from "@/lib/finance-policy";
import {
  getTeamIdentityForUsername,
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
} from "@/lib/team-auth";

export type FinancePrincipal = Extract<
  FinanceAccessState,
  { kind: "allowed" }
>;

export type FinanceAuthResult =
  | { ok: true; principal: FinancePrincipal }
  | { ok: false; status: 401 | 403; error: string };

export function financeAccessForTeamUsername(
  username: string | null | undefined,
): FinanceAuthResult {
  const identity = getTeamIdentityForUsername(username);
  const profile = identity ? TEAM_IDENTITIES[identity] : null;
  const state = evaluateFinanceAccess({
    username: profile?.username,
    name: profile?.name,
    accessLevel: profile?.accessLevel,
  });

  if (state.kind === "allowed") {
    return { ok: true, principal: state };
  }

  if (state.kind === "forbidden") {
    return {
      ok: false,
      status: 403,
      error: "Owner access is required to view Finance.",
    };
  }

  return {
    ok: false,
    status: 401,
    error: "Sign in to the Team Portal to view Finance.",
  };
}

export function requireFinanceAccess(request: NextRequest) {
  return financeAccessForTeamUsername(
    request.cookies.get(TEAM_SESSION_COOKIE)?.value,
  );
}

export async function requireFinancePageAccess() {
  const cookieStore = await cookies();
  return financeAccessForTeamUsername(
    cookieStore.get(TEAM_SESSION_COOKIE)?.value,
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
