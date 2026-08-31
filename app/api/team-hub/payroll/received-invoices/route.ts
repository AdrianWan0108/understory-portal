import type { NextRequest } from "next/server";
import {
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
  getTeamIdentityForUsername,
} from "@/lib/team-auth";
import {
  getFinanceStaffInvoices,
  staffInvoiceRouteError,
} from "@/lib/staff-invoices";

export const runtime = "nodejs";

function ownerFromRequest(request: NextRequest) {
  const identity = getTeamIdentityForUsername(
    request.cookies.get(TEAM_SESSION_COOKIE)?.value,
  );
  if (!identity) return null;
  const caller = TEAM_IDENTITIES[identity];
  return caller.accessLevel === "owner" ? caller : null;
}

export async function GET(request: NextRequest) {
  if (!ownerFromRequest(request)) {
    return Response.json(
      { error: "Owner access is required to view received invoices." },
      { status: 403 },
    );
  }

  try {
    const invoices = (await getFinanceStaffInvoices()).map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      staffName: invoice.staffName,
      month: invoice.month,
      totalHours: invoice.totalHours,
      totalAmount: invoice.totalAmount,
      status: invoice.status,
      submittedAt: invoice.submittedAt,
      pdfHref: invoice.pdfHref,
    }));
    return Response.json(
      { invoices },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (caught) {
    return staffInvoiceRouteError(caught);
  }
}
