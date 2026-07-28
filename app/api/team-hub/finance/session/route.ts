import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  FINANCE_SESSION_COOKIE,
  clearFinanceSessionCookie,
  isTrustedMutationOrigin,
  revokeFinanceSession,
} from "@/lib/finance-auth";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest) {
  if (!isTrustedMutationOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  await revokeFinanceSession(
    request.cookies.get(FINANCE_SESSION_COOKIE)?.value,
  );
  const response = NextResponse.json({ signedOut: true });
  clearFinanceSessionCookie(response);
  return response;
}
