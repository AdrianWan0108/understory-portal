export const WORKSPACE_CLIENTS = {
  mvp: { name: "MVP", slug: "mvp" },
  boardwalk: { name: "Boardwalk", slug: "boardwalk" },
  "red-house": {
    name: "Red House Vision Centre",
    slug: "red-house",
  },
  uglint: { name: "Uglint", slug: "uglint" },
} as const;

export type WorkspaceClientSlug = keyof typeof WORKSPACE_CLIENTS;

export const WORKSPACE_CLIENT_SLUGS = Object.keys(
  WORKSPACE_CLIENTS,
) as WorkspaceClientSlug[];

export function isWorkspaceClientSlug(
  value: string | null,
): value is WorkspaceClientSlug {
  return Boolean(value && value in WORKSPACE_CLIENTS);
}
