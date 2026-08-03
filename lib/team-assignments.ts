import { TEAM_IDENTITIES } from "@/lib/team-auth";

export const DEFAULT_TASK_WATCHER_USERNAMES = Object.values(TEAM_IDENTITIES)
  .filter((member) => member.accessLevel === "owner")
  .map((member) => member.username);

export function teamUsernameForName(name: string | null | undefined) {
  if (!name) return null;
  const normalizedName = name.trim().toLocaleLowerCase();
  return (
    Object.values(TEAM_IDENTITIES).find(
      (member) => member.name.toLocaleLowerCase() === normalizedName,
    )?.username ?? null
  );
}

export function teamNameForUsername(username: string | null | undefined) {
  if (!username) return null;
  const normalizedUsername = username.trim().toLocaleLowerCase();
  return (
    Object.values(TEAM_IDENTITIES).find(
      (member) =>
        member.username.toLocaleLowerCase() === normalizedUsername,
    )?.name ?? null
  );
}

export function normalizeAssigneeUsernames(
  usernames: string[] | null | undefined,
  legacyAssignedTo?: string | null,
) {
  if (Array.isArray(usernames) && usernames.length > 0) {
    return Array.from(new Set(usernames.filter(Boolean)));
  }

  const legacyUsername = teamUsernameForName(legacyAssignedTo);
  return legacyUsername ? [legacyUsername] : [];
}
