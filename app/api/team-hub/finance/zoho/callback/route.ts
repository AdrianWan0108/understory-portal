import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/finance-auth";
import { financeRouteError } from "@/lib/finance-http";
import { completeZohoOAuth } from "@/lib/zoho-books";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await requireFinanceAccess(request);
  if (!access.ok) {
    return Response.json({ error: access.error }, { status: access.status });
  }

  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError) {
    return Response.json(
      { error: "Zoho authorization was not approved." },
      { status: 400 },
    );
  }
  if (!state || !code) {
    return Response.json(
      { error: "Zoho OAuth callback parameters are missing." },
      { status: 400 },
    );
  }

  try {
    await completeZohoOAuth({
      state,
      code,
      userId: access.principal.userId,
    });
    return NextResponse.redirect(
      new URL("/team-hub/management/finance?connected=1", request.url),
      303,
    );
  } catch (caught) {
    return financeRouteError(caught);
  }
}
