import type { NextRequest } from "next/server";
import { isTrustedMutationOrigin } from "@/lib/finance-auth";
import {
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
  getTeamIdentityForUsername,
} from "@/lib/team-auth";
import {
  getStaffPrivateProfileMeta,
  revealStaffPrivateProfile,
  staffPrivateProfileRouteError,
} from "@/lib/staff-private-profile";

export const runtime = "nodejs";

function callerFromRequest(request: NextRequest) {
  const identity = getTeamIdentityForUsername(
    request.cookies.get(TEAM_SESSION_COOKIE)?.value,
  );
  return identity ? TEAM_IDENTITIES[identity] : null;
}

export async function GET(request: NextRequest) {
  const caller = callerFromRequest(request);
  if (!caller) {
    return Response.json(
      { error: "Sign in to view private profile details." },
      { status: 401 },
    );
  }

  try {
    return Response.json(await getStaffPrivateProfileMeta(caller.username), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (caught) {
    return staffPrivateProfileRouteError(caught);
  }
}

export async function POST(request: NextRequest) {
  const caller = callerFromRequest(request);
  if (!caller) {
    return Response.json(
      { error: "Sign in to view private profile details." },
      { status: 401 },
    );
  }
  if (!isTrustedMutationOrigin(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    return Response.json(
      {
        details: await revealStaffPrivateProfile(
          caller.username,
          body.accessCode,
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (caught) {
    return staffPrivateProfileRouteError(caught);
  }
}
