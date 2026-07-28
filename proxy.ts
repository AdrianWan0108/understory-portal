import { NextResponse, type NextRequest } from "next/server";
import {
  isValidTeamUsername,
  TEAM_LOGIN_PATH,
  TEAM_SESSION_COOKIE,
} from "@/lib/team-auth";
import {
  FINANCE_SESSION_COOKIE,
  financeAccessForSessionToken,
} from "@/lib/finance-auth";

const FINANCE_PAGE_PATH = "/team-hub/management/finance";
const FINANCE_SIGN_IN_PATH = `${FINANCE_PAGE_PATH}/sign-in`;

function financeDeniedResponse(status: 403 | 503) {
  const title =
    status === 403
      ? "Finance access is restricted"
      : "Finance authorization is unavailable";
  const message =
    status === 403
      ? "This page requires a verified Finance session and an active database permission."
      : "The portal could not verify Finance access. Try again shortly.";

  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${status} · ${title}</title></head><body style="margin:0;background:#f4eef8;color:#28154f;font-family:system-ui,sans-serif"><main style="min-height:100vh;display:grid;place-items:center;padding:24px"><section style="max-width:520px;background:white;border:1px solid #d7cbe0;border-radius:28px;padding:40px;text-align:center;box-shadow:0 20px 60px rgba(40,21,79,.12)"><p style="color:#7d4698;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">${status} · ${status === 403 ? "Forbidden" : "Unavailable"}</p><h1 style="font-size:32px;line-height:1.1">${title}</h1><p style="color:#75647f;line-height:1.6">${message}</p><p style="margin-top:28px"><a href="${FINANCE_SIGN_IN_PATH}" style="display:inline-block;background:#341f60;color:white;border-radius:999px;padding:12px 20px;text-decoration:none;font-weight:700">Secure Finance sign-in</a></p></section></main></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    },
  );
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === TEAM_LOGIN_PATH) {
    return NextResponse.next();
  }

  const username = request.cookies.get(TEAM_SESSION_COOKIE)?.value;

  if (isValidTeamUsername(username)) {
    const isProtectedFinancePage =
      request.nextUrl.pathname === FINANCE_PAGE_PATH ||
      (request.nextUrl.pathname.startsWith(`${FINANCE_PAGE_PATH}/`) &&
        request.nextUrl.pathname !== FINANCE_SIGN_IN_PATH);

    if (isProtectedFinancePage) {
      const access = await financeAccessForSessionToken(
        request.cookies.get(FINANCE_SESSION_COOKIE)?.value,
      );
      if (!access.ok) {
        return financeDeniedResponse(access.status === 500 ? 503 : 403);
      }
    }

    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  loginUrl.pathname = TEAM_LOGIN_PATH;
  loginUrl.search = "";
  loginUrl.searchParams.set("returnTo", returnTo);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/team/:path*", "/team-hub/:path*"],
};
