import type { NextRequest } from "next/server";
import {
  isTrustedMutationOrigin,
  requireFinanceAccess,
} from "@/lib/finance-auth";
import {
  getStaffHoursSnapshot,
  removeStaffTimeEntry,
  staffHoursRouteError,
} from "@/lib/staff-hours";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ entryId: string }> },
) {
  const access = await requireFinanceAccess(request);
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }
  if (!isTrustedMutationOrigin(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const { entryId } = await context.params;
    await removeStaffTimeEntry(entryId);
    return Response.json(
      await getStaffHoursSnapshot(request.nextUrl.searchParams.get("month")),
    );
  } catch (caught) {
    return staffHoursRouteError(caught);
  }
}
