import type { NextRequest } from "next/server";
import { requireFinanceAccess } from "@/lib/finance-auth";
import { financeRouteError } from "@/lib/finance-http";
import { getZohoConnectionStatus } from "@/lib/zoho-books";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await requireFinanceAccess(request);
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  try {
    return Response.json(await getZohoConnectionStatus());
  } catch (caught) {
    return financeRouteError(caught);
  }
}
