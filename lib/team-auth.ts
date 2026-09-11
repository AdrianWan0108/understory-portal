export type TeamAccessLevel = "owner" | "staff" | "guest";
export type TeamIdentity =
  | "karen"
  | "adrian"
  | "arion"
  | "sure"
  | "xiyangcen"
  | "bruno"
  | "guest";
export type TeamMemberIdentity = Exclude<TeamIdentity, "guest">;

export const TEAM_SESSION_COOKIE = "team_session";
export const TEAM_LOGIN_PATH = "/team-hub/login";
export const TEAM_DEFAULT_PATH = "/team-hub/dashboard";
export const TEAM_GUEST_DEFAULT_PATH = "/team-hub/social-media-calendar";

export const TEAM_IDENTITIES = {
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
  guest: {
    username: "Understory_Guest",
    name: "Guest",
    title: "Social media editor",
    accessLevel: "guest",
    initials: "G",
  },
} satisfies Record<
  TeamIdentity,
  {
    username: string;
    name: string;
    title: string;
    accessLevel: TeamAccessLevel;
    initials: string;
  }
>;

export const TEAM_MEMBER_PROFILES = Object.values(TEAM_IDENTITIES).filter(
  (profile) => profile.accessLevel !== "guest",
);

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

export function getTeamMemberIdentityForUsername(
  username: string | null | undefined,
): TeamMemberIdentity | null {
  const identity = getTeamIdentityForUsername(username);
  return identity && identity !== "guest" ? identity : null;
}

export function isValidTeamUsername(
  username: string | null | undefined,
): boolean {
  return getTeamIdentityForUsername(username) !== null;
}

export function shouldRestrictSocialContentCardsToUser({
  username,
  accessLevel,
}: {
  username: string;
  accessLevel: TeamAccessLevel;
}): boolean {
  return (
    accessLevel === "staff" &&
    username.trim().toLocaleLowerCase() !==
      TEAM_IDENTITIES.sure.username.toLocaleLowerCase()
  );
}

export function isGuestAllowedTeamPath(pathname: string) {
  return (
    pathname === TEAM_GUEST_DEFAULT_PATH ||
    pathname.startsWith(`${TEAM_GUEST_DEFAULT_PATH}/`)
  );
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
    return accessLevel === "guest" ? TEAM_GUEST_DEFAULT_PATH : TEAM_DEFAULT_PATH;
  }

  let parsedPath: URL;

  try {
    parsedPath = new URL(requestedPath, "https://team.local");
  } catch {
    return accessLevel === "guest" ? TEAM_GUEST_DEFAULT_PATH : TEAM_DEFAULT_PATH;
  }

  const isTeamRoute =
    parsedPath.pathname === "/team" ||
    parsedPath.pathname.startsWith("/team/") ||
    parsedPath.pathname === "/team-hub" ||
    parsedPath.pathname.startsWith("/team-hub/");

  if (!isTeamRoute || parsedPath.pathname === TEAM_LOGIN_PATH) {
    return accessLevel === "guest" ? TEAM_GUEST_DEFAULT_PATH : TEAM_DEFAULT_PATH;
  }

  if (
    accessLevel === "guest" &&
    !isGuestAllowedTeamPath(parsedPath.pathname)
  ) {
    return TEAM_GUEST_DEFAULT_PATH;
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
