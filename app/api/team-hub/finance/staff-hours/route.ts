import type { NextRequest } from "next/server";
import { requireFinanceAccess } from "@/lib/finance-auth";
import {
  getStaffHoursSnapshot,
  staffHoursRouteError,
} from "@/lib/staff-hours";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await requireFinanceAccess(request);
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  try {
    return Response.json(
      await getStaffHoursSnapshot(request.nextUrl.searchParams.get("month")),
    );
  } catch (caught) {
    return staffHoursRouteError(caught);
  }
}
