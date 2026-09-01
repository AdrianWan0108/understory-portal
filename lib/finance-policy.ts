export type FinanceAccessState =
  | { kind: "allowed"; username: string; name: string }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" };

export function evaluateFinanceAccess(input: {
  username?: string | null;
  name?: string | null;
  accessLevel?: "owner" | "staff" | null;
}): FinanceAccessState {
  if (!input.username || !input.name || !input.accessLevel) {
    return { kind: "unauthenticated" };
  }

  if (input.accessLevel !== "owner") {
    return { kind: "forbidden" };
  }

  return {
    kind: "allowed",
    username: input.username,
    name: input.name,
  };
}

export function shouldShowFinanceNavigation(
  accessLevel: "owner" | "staff" | null,
) {
  return accessLevel === "owner";
}

export function financePageDecision(access: FinanceAccessState) {
  return access.kind === "allowed" ? "render" : "forbidden";
}
