import type { NextRequest } from "next/server";
import {
  isTrustedMutationOrigin,
  requireFinanceAccess,
} from "@/lib/finance-auth";
import {
  getStaffHoursSnapshot,
  saveStaffBudget,
  staffHoursRouteError,
} from "@/lib/staff-hours";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const access = await requireFinanceAccess(request);
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }
  if (!isTrustedMutationOrigin(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    await saveStaffBudget(body, access.principal.userId);
    return Response.json(await getStaffHoursSnapshot(body.month));
  } catch (caught) {
    return staffHoursRouteError(caught);
  }
}
