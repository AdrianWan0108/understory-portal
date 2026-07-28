export type FinanceAccessState =
  | { kind: "allowed"; userId: string; profileId: string; name: string }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" };

export function evaluateFinanceAccess(input: {
  sessionUserId?: string | null;
  sessionExpiresAt?: string | null;
  profile?: {
    id: string;
    full_name: string;
    can_view_finance: boolean;
  } | null;
  now?: number;
}): FinanceAccessState {
  const now = input.now ?? Date.now();
  const expiresAt = input.sessionExpiresAt
    ? Date.parse(input.sessionExpiresAt)
    : Number.NaN;

  if (
    !input.sessionUserId ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now
  ) {
    return { kind: "unauthenticated" };
  }

  if (
    !input.profile ||
    !input.profile.can_view_finance ||
    input.profile.id.length === 0
  ) {
    return { kind: "forbidden" };
  }

  return {
    kind: "allowed",
    userId: input.sessionUserId,
    profileId: input.profile.id,
    name: input.profile.full_name,
  };
}

export function shouldShowFinanceNavigation(
  accessLevel: "owner" | "staff" | null,
  hasVerifiedFinanceAccess: boolean,
) {
  return accessLevel === "owner" && hasVerifiedFinanceAccess;
}

export function financePageDecision(access: FinanceAccessState) {
  return access.kind === "allowed" ? "render" : "forbidden";
}
