import type { NextRequest } from "next/server";
import {
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
  getTeamIdentityForUsername,
} from "@/lib/team-auth";

export const runtime = "nodejs";

function callerFromRequest(request: NextRequest) {
  const identity = getTeamIdentityForUsername(
    request.cookies.get(TEAM_SESSION_COOKIE)?.value,
  );
  if (!identity) return null;
  return TEAM_IDENTITIES[identity];
}

export async function DELETE(request: NextRequest) {
  const caller = callerFromRequest(request);
  if (!caller) {
    return Response.json(
      { error: "Sign in to access payroll." },
      { status: 401 },
    );
  }
  return Response.json(
    {
      error:
        "Submitted hours are locked. Contact Finance if a correction is needed.",
      code: "TIME_ENTRY_LOCKED",
    },
    { status: 403 },
  );
}
