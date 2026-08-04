"use client";

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  projectClientTheme,
  readStoredProjectClient,
  storeProjectClient,
} from "@/lib/project-client-theme";
import { supabase } from "@/lib/supabase";
import {
  isWorkspaceClientSlug,
  type WorkspaceClientSlug,
} from "@/lib/workspace-clients";

type ProjectThemeContextValue = {
  client: WorkspaceClientSlug;
  isReady: boolean;
  setClient: (client: WorkspaceClientSlug) => void;
};

const ProjectThemeContext =
  createContext<ProjectThemeContextValue | null>(null);

function taskIdFromPathname(pathname: string) {
  const match = pathname.match(
    /^\/team-hub\/projects\/([0-9a-f-]{36})(?:\/|$)/i,
  );
  return match?.[1] ?? null;
}

export function ProjectThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [client, setClientState] = useState<WorkspaceClientSlug>("mvp");
  const [isReady, setIsReady] = useState(false);

  const setClient = useCallback((nextClient: WorkspaceClientSlug) => {
    setClientState(nextClient);
    storeProjectClient(nextClient);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function resolveClient() {
      const queryClient = new URLSearchParams(window.location.search).get(
        "client",
      );
      if (isWorkspaceClientSlug(queryClient)) {
        setClient(queryClient);
        setIsReady(true);
        return;
      }

      const taskId = taskIdFromPathname(pathname);
      if (taskId) {
        const { data: task } = await supabase
          .from("division_tasks")
          .select("client_id")
          .eq("id", taskId)
          .maybeSingle();

        if (!isActive) return;
        if (task?.client_id) {
          const { data: clientRecord } = await supabase
            .from("clients")
            .select("slug")
            .eq("id", task.client_id)
            .maybeSingle();

          if (!isActive) return;
          const resolvedSlug = clientRecord?.slug ?? null;
          if (isWorkspaceClientSlug(resolvedSlug)) {
            setClient(resolvedSlug);
            setIsReady(true);
            return;
          }
        }
      }

      const storedClient = readStoredProjectClient();
      if (storedClient) setClientState(storedClient);
      setIsReady(true);
    }

    void resolveClient();
    return () => {
      isActive = false;
    };
  }, [pathname, setClient]);

  const value = useMemo(
    () => ({ client, isReady, setClient }),
    [client, isReady, setClient],
  );

  return (
    <ProjectThemeContext.Provider value={value}>
      <div
        data-theme={projectClientTheme(client)}
        className="client-portal-theme project-theme-surface min-h-[calc(100vh-65px)] bg-[var(--background)] text-[var(--foreground)] transition-colors"
      >
        {children}
      </div>
    </ProjectThemeContext.Provider>
  );
}

export function useProjectTheme() {
  const context = useContext(ProjectThemeContext);
  if (!context) {
    throw new Error("useProjectTheme must be used inside ProjectThemeProvider");
  }
  return context;
}

export function useOptionalProjectTheme() {
  return useContext(ProjectThemeContext);
}
