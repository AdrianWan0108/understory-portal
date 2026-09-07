import { NextResponse, type NextRequest } from "next/server";
import {
  getTeamIdentityForUsername,
  isGuestAllowedTeamPath,
  isValidTeamUsername,
  TEAM_GUEST_DEFAULT_PATH,
  TEAM_IDENTITIES,
  TEAM_LOGIN_PATH,
  TEAM_SESSION_COOKIE,
} from "@/lib/team-auth";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === TEAM_LOGIN_PATH) {
    return NextResponse.next();
  }

  const username = request.cookies.get(TEAM_SESSION_COOKIE)?.value;

  if (isValidTeamUsername(username)) {
    const identity = getTeamIdentityForUsername(username);
    if (
      identity &&
      TEAM_IDENTITIES[identity].accessLevel === "guest" &&
      !isGuestAllowedTeamPath(request.nextUrl.pathname)
    ) {
      const guestHome = request.nextUrl.clone();
      guestHome.pathname = TEAM_GUEST_DEFAULT_PATH;
      guestHome.search = "";
      return NextResponse.redirect(guestHome);
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
