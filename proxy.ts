import { NextResponse, type NextRequest } from "next/server";
import {
  isValidTeamUsername,
  TEAM_LOGIN_PATH,
  TEAM_SESSION_COOKIE,
} from "@/lib/team-auth";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === TEAM_LOGIN_PATH) {
    return NextResponse.next();
  }

  const username = request.cookies.get(TEAM_SESSION_COOKIE)?.value;

  if (isValidTeamUsername(username)) {
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
