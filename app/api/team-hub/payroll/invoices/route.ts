import type { NextRequest } from "next/server";
import { isTrustedMutationOrigin } from "@/lib/finance-auth";
import {
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
  getTeamIdentityForUsername,
} from "@/lib/team-auth";
import {
  getStaffInvoiceWorkspace,
  staffInvoiceRouteError,
  submitStaffInvoice,
} from "@/lib/staff-invoices";

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
    return Response.json({ error: "Sign in to view invoices." }, { status: 401 });
  }
  try {
    return Response.json(
      await getStaffInvoiceWorkspace(
        caller.username,
        request.nextUrl.searchParams.get("month"),
      ),
    );
  } catch (caught) {
    return staffInvoiceRouteError(caught);
  }
}

export async function POST(request: NextRequest) {
  const caller = callerFromRequest(request);
  if (!caller || caller.accessLevel !== "staff") {
    return Response.json(
      { error: "A staff session is required to send an invoice." },
      { status: caller ? 403 : 401 },
    );
  }
  if (!isTrustedMutationOrigin(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.approved !== true) {
      return Response.json(
        { error: "Review and approve the invoice PDF before sending it." },
        { status: 422 },
      );
    }
    return Response.json(
      await submitStaffInvoice(caller.username, body.month),
      { status: 201 },
    );
  } catch (caught) {
    return staffInvoiceRouteError(caught);
  }
}
