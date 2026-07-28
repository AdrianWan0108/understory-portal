import type { NextRequest } from "next/server";
import {
  isTrustedMutationOrigin,
  requireFinanceAccess,
} from "@/lib/finance-auth";
import { financeRouteError } from "@/lib/finance-http";
import {
  getFinanceDashboard,
  getZohoConnectionStatus,
} from "@/lib/zoho-books";

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
    const connection = await getZohoConnectionStatus();
    if (!connection.connected) {
      return Response.json(
        { error: "Zoho Books is not connected.", code: "DISCONNECTED" },
        { status: 409 },
      );
    }
    return Response.json({
      connection,
      dashboard: await getFinanceDashboard(true),
    });
  } catch (caught) {
    return financeRouteError(caught);
  }
}
