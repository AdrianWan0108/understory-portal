import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  createFinanceSessionForVerifiedUser,
  setFinanceSessionCookie,
} from "@/lib/finance-auth";
import {
  FINANCE_GITHUB_CALLBACK_PATH,
  FINANCE_GITHUB_PKCE_COOKIE,
  FinanceGitHubAuthError,
  completeFinanceGitHubOAuth,
} from "@/lib/finance-github-auth";

export const runtime = "nodejs";

function callbackUrl(request: NextRequest) {
  const origin = process.env.FRONTEND_URL
    ? new URL(process.env.FRONTEND_URL).origin
    : request.nextUrl.origin;
  return new URL(FINANCE_GITHUB_CALLBACK_PATH, origin).toString();
}

function clearPkceCookie(response: NextResponse) {
  response.cookies.set(FINANCE_GITHUB_PKCE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/team-hub/finance/session/github",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "private, no-store");
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");
  const sealedState = request.cookies.get(FINANCE_GITHUB_PKCE_COOKIE)?.value;

  if (!code || oauthError || !sealedState) {
    const response = NextResponse.json(
      { error: "GitHub sign-in was cancelled, invalid, or expired." },
      { status: 400 },
    );
    clearPkceCookie(response);
    return response;
  }

  try {
    const verified = await completeFinanceGitHubOAuth({
      code,
      callbackUrl: callbackUrl(request),
      sealedState,
    });
    const session = await createFinanceSessionForVerifiedUser(verified.userId);
    if (!session.ok) {
      const response = NextResponse.json(
        { error: session.error },
        { status: session.status },
      );
      clearPkceCookie(response);
      return response;
    }

    const response = NextResponse.redirect(
      new URL("/team-hub/management/finance", request.url),
      303,
    );
    setFinanceSessionCookie(response, session.token, session.expiresAt);
    clearPkceCookie(response);
    return response;
  } catch (caught) {
    const error =
      caught instanceof FinanceGitHubAuthError
        ? caught
        : new FinanceGitHubAuthError(
            "GitHub sign-in could not be completed.",
            500,
            "OAUTH_CALLBACK_FAILED",
          );
    const response = NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
    clearPkceCookie(response);
    return response;
  }
}
