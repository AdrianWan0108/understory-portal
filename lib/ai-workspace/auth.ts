export const AI_WORKSPACE_PATH = "/team-hub/ai-workspace";
export const AI_WORKSPACE_CALLBACK_PATH = `${AI_WORKSPACE_PATH}/auth/callback`;
export const AI_WORKSPACE_NEXT_STORAGE_KEY = "understory.ai-workspace.next";
export const UNLINKED_AI_PROFILE_MESSAGE =
  "Your GitHub account authenticated successfully, but it is not linked to an authorized Understory team profile.";

export type AiWorkspaceActor = {
  id: string;
  userId: string;
  role: "owner" | "staff" | "contractor";
  teamUsername: string | null;
  fullName: string;
};

export function getSafeAiWorkspaceNext(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return AI_WORKSPACE_PATH;
  }

  try {
    const parsed = new URL(value, "https://understory.invalid");
    const isWorkspacePath =
      parsed.origin === "https://understory.invalid" &&
      (parsed.pathname === AI_WORKSPACE_PATH || parsed.pathname.startsWith(`${AI_WORKSPACE_PATH}/`)) &&
      parsed.pathname !== AI_WORKSPACE_CALLBACK_PATH;
    return isWorkspacePath
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : AI_WORKSPACE_PATH;
  } catch {
    return AI_WORKSPACE_PATH;
  }
}

export function aiWorkspaceCallbackUrl(origin: string) {
  return new URL(AI_WORKSPACE_CALLBACK_PATH, origin).toString();
}

export function getAiWorkspaceOAuthRecoveryPath(input: {
  hasPendingAiOAuth: boolean;
  search: string;
  hash: string;
}) {
  const fragment = new URLSearchParams(input.hash.replace(/^#/, ""));
  const query = new URLSearchParams(input.search.replace(/^\?/, ""));
  const hasOAuthSession =
    fragment.has("access_token") && fragment.has("refresh_token");
  const hasOAuthError =
    (fragment.has("error") && fragment.has("error_description")) ||
    (query.has("error") && query.has("error_description"));
  const hasOAuthResult = hasOAuthSession || hasOAuthError;

  // Supabase falls back to the configured Site URL when redirectTo is not
  // allow-listed. That URL can be on a different origin, where the pending
  // sessionStorage marker is unavailable. A complete Supabase OAuth result is
  // sufficient to recover the callback safely on that origin.
  if (!input.hasPendingAiOAuth && !hasOAuthResult) return null;

  return hasOAuthResult
    ? `${AI_WORKSPACE_CALLBACK_PATH}${input.search}${input.hash}`
    : null;
}

type OAuthStarter = (input: {
  provider: "github";
  options: { redirectTo: string };
}) => Promise<{ error: { message: string } | null }>;

export async function startGithubAiWorkspaceOAuth(start: OAuthStarter, origin: string) {
  return start({
    provider: "github",
    options: { redirectTo: aiWorkspaceCallbackUrl(origin) },
  });
}

type FetchLike = (input: string, init: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export async function resolveAiWorkspaceActor(accessToken: string, request: FetchLike) {
  let response;
  try {
    response = await request("/api/ai/me", {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return { status: "error" as const };
  }

  if (response.ok) {
    try {
      const result = await response.json() as { actor?: AiWorkspaceActor };
      if (result.actor) return { status: "authorized" as const, actor: result.actor };
    } catch {
      return { status: "error" as const };
    }
  }

  if (response.status === 401 || response.status === 403) {
    return { status: "unauthorized" as const };
  }

  return { status: "error" as const };
}
