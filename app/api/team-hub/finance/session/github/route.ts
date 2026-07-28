import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isTrustedMutationOrigin } from "@/lib/finance-auth";
import {
  FINANCE_GITHUB_CALLBACK_PATH,
  FINANCE_GITHUB_PKCE_COOKIE,
  FinanceGitHubAuthError,
  startFinanceGitHubOAuth,
} from "@/lib/finance-github-auth";

export const runtime = "nodejs";

function callbackUrl(request: NextRequest) {
  const origin = process.env.FRONTEND_URL
    ? new URL(process.env.FRONTEND_URL).origin
    : request.nextUrl.origin;
  return new URL(FINANCE_GITHUB_CALLBACK_PATH, origin).toString();
}

export async function POST(request: NextRequest) {
  if (!isTrustedMutationOrigin(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  }

  try {
    const started = await startFinanceGitHubOAuth(callbackUrl(request));
    const response = NextResponse.json({
      authorizationUrl: started.authorizationUrl,
    });
    response.cookies.set(
      FINANCE_GITHUB_PKCE_COOKIE,
      started.sealedState,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/team-hub/finance/session/github",
        expires: started.expiresAt,
        priority: "high",
      },
    );
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (caught) {
    const error =
      caught instanceof FinanceGitHubAuthError
        ? caught
        : new FinanceGitHubAuthError(
            "Could not start GitHub sign-in.",
            500,
            "OAUTH_START_FAILED",
          );
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
}
