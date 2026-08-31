import type { NextRequest } from "next/server";
import {
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
  getTeamIdentityForUsername,
} from "@/lib/team-auth";
import {
  getStaffInvoicePreview,
  staffInvoiceRouteError,
} from "@/lib/staff-invoices";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const identity = getTeamIdentityForUsername(
    request.cookies.get(TEAM_SESSION_COOKIE)?.value,
  );
  const caller = identity ? TEAM_IDENTITIES[identity] : null;
  if (!caller || caller.accessLevel !== "staff") {
    return Response.json(
      { error: "A staff session is required to preview an invoice." },
      { status: caller ? 403 : 401 },
    );
  }

  try {
    const pdf = await getStaffInvoicePreview(
      caller.username,
      request.nextUrl.searchParams.get("month"),
    );
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
