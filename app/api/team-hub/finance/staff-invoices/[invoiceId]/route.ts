import type { NextRequest } from "next/server";
import {
  isTrustedMutationOrigin,
  requireFinanceAccess,
} from "@/lib/finance-auth";
import {
  markStaffInvoicePaid,
  staffInvoiceRouteError,
} from "@/lib/staff-invoices";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const access = await requireFinanceAccess(request);
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }
  if (!isTrustedMutationOrigin(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const { invoiceId } = await context.params;
    return Response.json({
      invoice: await markStaffInvoicePaid(
        invoiceId,
        access.principal.username,
      ),
    });
  } catch (caught) {
    return staffInvoiceRouteError(caught);
  }
}
