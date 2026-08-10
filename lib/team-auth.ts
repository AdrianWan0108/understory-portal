export type TeamAccessLevel = "owner" | "staff";
export type TeamIdentity =
  | "karen"
  | "adrian"
  | "arion"
  | "sure"
  | "emilia"
  | "xiyangcen"
  | "bruno";

export const TEAM_SESSION_COOKIE = "team_session";
export const TEAM_LOGIN_PATH = "/team-hub/login";
export const TEAM_DEFAULT_PATH = "/team-hub/dashboard";

export const TEAM_IDENTITIES: Record<
  TeamIdentity,
  {
    username: string;
    name: string;
    title: string;
    accessLevel: TeamAccessLevel;
    initials: string;
  }
> = {
  karen: {
    username: "Understory_Karen",
    name: "Karen",
    title: "Owner",
    accessLevel: "owner",
    initials: "K",
  },
  adrian: {
    username: "Understory_Adrian",
    name: "Adrian",
    title: "Co-owner",
    accessLevel: "owner",
    initials: "A",
  },
  arion: {
    username: "Understory_Arion",
    name: "Arion",
    title: "Creative Director",
    accessLevel: "staff",
    initials: "A",
  },
  sure: {
    username: "Understory_Sure",
    name: "Sure",
    title: "Media Buyer",
    accessLevel: "staff",
    initials: "S",
  },
  emilia: {
    username: "Understory_Emilia",
    name: "Emilia",
    title: "Graphic Designer",
    accessLevel: "staff",
    initials: "E",
  },
  xiyangcen: {
    username: "Understory_Xiyangcen",
    name: "Xiyangcen",
    title: "Graphic Designer",
    accessLevel: "staff",
    initials: "X",
  },
  bruno: {
    username: "Understory_Bruno",
    name: "Bruno",
    title: "Video Editor",
    accessLevel: "staff",
    initials: "B",
  },
};

export const VALID_TEAM_USERNAMES = Object.values(TEAM_IDENTITIES).map(
  (profile) => profile.username,
);

export function getTeamIdentityForUsername(
  username: string | null | undefined,
): TeamIdentity | null {
  if (!username) return null;

  const normalizedUsername = username.trim().toLocaleLowerCase();

  return (
    (Object.keys(TEAM_IDENTITIES) as TeamIdentity[]).find(
      (identity) =>
        TEAM_IDENTITIES[identity].username.toLocaleLowerCase() ===
        normalizedUsername,
    ) ?? null
  );
}

export function isValidTeamUsername(
  username: string | null | undefined,
): boolean {
  return getTeamIdentityForUsername(username) !== null;
}

export function getSafeTeamReturnPath(
  requestedPath: string | null | undefined,
  accessLevel?: TeamAccessLevel,
) {
  if (
    !requestedPath ||
    !requestedPath.startsWith("/") ||
    requestedPath.startsWith("//")
  ) {
    return TEAM_DEFAULT_PATH;
  }

  let parsedPath: URL;

  try {
    parsedPath = new URL(requestedPath, "https://team.local");
  } catch {
    return TEAM_DEFAULT_PATH;
  }

  const isTeamRoute =
    parsedPath.pathname === "/team" ||
    parsedPath.pathname.startsWith("/team/") ||
    parsedPath.pathname === "/team-hub" ||
    parsedPath.pathname.startsWith("/team-hub/");

  if (!isTeamRoute || parsedPath.pathname === TEAM_LOGIN_PATH) {
    return TEAM_DEFAULT_PATH;
  }

  if (
    accessLevel === "staff" &&
    (parsedPath.pathname === "/team-hub/management" ||
      parsedPath.pathname.startsWith("/team-hub/management/"))
  ) {
    return TEAM_DEFAULT_PATH;
  }

  return `${parsedPath.pathname}${parsedPath.search}`;
}
