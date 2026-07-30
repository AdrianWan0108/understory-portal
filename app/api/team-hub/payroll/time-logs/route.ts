import type { NextRequest } from "next/server";
import { isTrustedMutationOrigin } from "@/lib/finance-auth";
import {
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
  getTeamIdentityForUsername,
} from "@/lib/team-auth";
import {
  addPayrollTimeLog,
  getPayrollTimeLogSnapshot,
  payrollTimeLogRouteError,
} from "@/lib/payroll-time-logs";

export const runtime = "nodejs";

function callerFromRequest(request: NextRequest) {
  const identity = getTeamIdentityForUsername(
    request.cookies.get(TEAM_SESSION_COOKIE)?.value,
  );
  if (!identity) return null;
  return TEAM_IDENTITIES[identity];
}

export async function GET(request: NextRequest) {
  const caller = callerFromRequest(request);
  if (!caller) {
    return Response.json(
      { error: "Sign in to view your time logs." },
      { status: 401 },
    );
  }

  try {
    return Response.json(
      await getPayrollTimeLogSnapshot(
        caller.username,
        request.nextUrl.searchParams.get("week"),
      ),
    );
  } catch (caught) {
    return payrollTimeLogRouteError(caught);
  }
}

export async function POST(request: NextRequest) {
  const caller = callerFromRequest(request);
  if (!caller) {
    return Response.json(
      { error: "Sign in to log your hours." },
      { status: 401 },
    );
  }
  if (!isTrustedMutationOrigin(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    return Response.json(await addPayrollTimeLog(caller.username, body), {
      status: 201,
    });
  } catch (caught) {
    return payrollTimeLogRouteError(caught);
  }
}
