import type { NextRequest } from "next/server";
import {
  isTrustedMutationOrigin,
  requireFinanceAccess,
} from "@/lib/finance-auth";
import {
  addStaffTimeEntry,
  getStaffHoursSnapshot,
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
    await addStaffTimeEntry(body, access.principal.username);
    const month =
      typeof body.workDate === "string" ? body.workDate.slice(0, 7) : null;
    return Response.json(await getStaffHoursSnapshot(month));
  } catch (caught) {
    return staffHoursRouteError(caught);
  }
}
