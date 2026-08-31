import type { NextRequest } from "next/server";
import {
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
  getTeamIdentityForUsername,
} from "@/lib/team-auth";
import {
  getStaffInvoicePdf,
  staffInvoiceRouteError,
} from "@/lib/staff-invoices";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const identity = getTeamIdentityForUsername(
    request.cookies.get(TEAM_SESSION_COOKIE)?.value,
  );
  if (!identity) {
    return Response.json(
      { error: "Sign in to view this invoice PDF." },
      { status: 401 },
    );
  }
  const caller = TEAM_IDENTITIES[identity];

  try {
    const { invoiceId } = await context.params;
    const pdf = await getStaffInvoicePdf(invoiceId, caller);
    if (!pdf) {
      return Response.json({ error: "Invoice not found." }, { status: 404 });
    }
    return new Response(new Blob([Uint8Array.from(pdf.bytes)]), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (caught) {
    return staffInvoiceRouteError(caught);
  }
}
