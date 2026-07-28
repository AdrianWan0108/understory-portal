import type { NextRequest } from "next/server";
import { requireFinanceAccess } from "@/lib/finance-auth";
import { financeRouteError } from "@/lib/finance-http";
import {
  getFinanceDashboard,
  getZohoConnectionStatus,
} from "@/lib/zoho-books";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await requireFinanceAccess(request);
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  try {
    const connection = await getZohoConnectionStatus();
    if (!connection.connected) {
      return Response.json({ connection, dashboard: null });
    }
    return Response.json({
      connection,
      dashboard: await getFinanceDashboard(false),
    });
  } catch (caught) {
    return financeRouteError(caught);
  }
}
