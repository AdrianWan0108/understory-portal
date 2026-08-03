import {
  WORKSPACE_CLIENTS,
  isWorkspaceClientSlug,
  type WorkspaceClientSlug,
} from "@/lib/workspace-clients";

export const PROJECTS_CLIENT_STORAGE_KEY = "understory-projects-client";

export const projectInputClass =
  "w-full rounded-xl border border-[var(--input)] bg-[var(--card)] px-3.5 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--muted)]";

export type ProjectClientTheme = "mvp" | "boardwalk";

export function projectClientTheme(
  client: WorkspaceClientSlug,
): ProjectClientTheme | undefined {
  return client === "mvp" || client === "boardwalk" ? client : undefined;
}

export function projectClientInitial(client: WorkspaceClientSlug) {
  return WORKSPACE_CLIENTS[client].name.trim().charAt(0).toUpperCase();
}

export function readStoredProjectClient(): WorkspaceClientSlug | null {
  if (typeof window === "undefined") return null;
  const storedClient = window.sessionStorage.getItem(
    PROJECTS_CLIENT_STORAGE_KEY,
  );
  return isWorkspaceClientSlug(storedClient) ? storedClient : null;
}

export function storeProjectClient(client: WorkspaceClientSlug) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PROJECTS_CLIENT_STORAGE_KEY, client);
}
