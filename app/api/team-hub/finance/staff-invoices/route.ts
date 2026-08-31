import type { NextRequest } from "next/server";
import { requireFinanceAccess } from "@/lib/finance-auth";
import {
  getFinanceStaffInvoices,
  staffInvoiceRouteError,
} from "@/lib/staff-invoices";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await requireFinanceAccess(request);
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }
  try {
    return Response.json(
      { invoices: await getFinanceStaffInvoices() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (caught) {
    return staffInvoiceRouteError(caught);
  }
}
