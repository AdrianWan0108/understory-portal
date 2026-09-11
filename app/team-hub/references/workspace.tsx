"use client";

import { useEffect, useMemo, useState } from "react";
import { ClientSelect } from "@/app/_components/ClientSelect";
import { SocialResearchLog } from "@/app/team-hub/projects/_components/SocialResearchLog";
import { useProjectTheme } from "@/app/team-hub/projects/_components/ProjectThemeProvider";
import { TEAM_GUEST_REFERENCES_PATH } from "@/lib/team-auth";
import { supabase } from "@/lib/supabase";

type ReferenceClient = {
  name: string;
  slug: string;
};

type ReferenceTaskRow = {
  id: string;
  client_id: string;
  clients: ReferenceClient | ReferenceClient[] | null;
};

type ReferenceWorkspace = {
  id: string;
  clientId: string;
  clientName: string;
  clientSlug: string;
};

function referenceClient(row: ReferenceTaskRow) {
  return Array.isArray(row.clients) ? row.clients[0] : row.clients;
}

export function GuestSocialMediaReferences() {
  const { client, isReady, setClient } = useProjectTheme();
  const [workspaces, setWorkspaces] = useState<ReferenceWorkspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadReferenceWorkspaces() {
      setIsLoading(true);
      setError(null);

      const { data, error: referenceError } = await supabase
        .from("division_tasks")
        .select("id, client_id, clients(name, slug)")
        .eq("division", "social-media")
        .eq("template_type", "analytics_results_hub");

      if (!isActive) return;
      if (referenceError) {
        setError(`Could not load References: ${referenceError.message}`);
        setIsLoading(false);
        return;
      }

      const nextWorkspaces = ((data ?? []) as ReferenceTaskRow[])
        .map((row) => {
          const relatedClient = referenceClient(row);
          if (!relatedClient?.slug) return null;
          return {
            id: row.id,
            clientId: row.client_id,
            clientName: relatedClient.name,
            clientSlug: relatedClient.slug,
          };
        })
        .filter((workspace): workspace is ReferenceWorkspace =>
          Boolean(workspace),
        )
        .sort((left, right) =>
          left.clientName.localeCompare(right.clientName, "en-CA"),
        );

      setWorkspaces(nextWorkspaces);
      setIsLoading(false);
    }

    void loadReferenceWorkspaces();
    return () => {
      isActive = false;
    };
  }, []);

  const selectedWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.clientSlug === client) ??
      workspaces[0] ??
      null,
    [client, workspaces],
  );

  useEffect(() => {
    if (
      isReady &&
      selectedWorkspace &&
      selectedWorkspace.clientSlug !== client
    ) {
      setClient(selectedWorkspace.clientSlug);
    }
  }, [client, isReady, selectedWorkspace, setClient]);

  function selectWorkspace(clientSlug: string) {
    setClient(clientSlug);
    const url = new URL(window.location.href);
    url.pathname = TEAM_GUEST_REFERENCES_PATH;
    url.search = "";
    url.searchParams.set("client", clientSlug);
    window.history.replaceState({}, "", url);
  }

  if (!isReady || isLoading) {
    return (
      <main className="min-h-screen px-5 py-10 sm:px-8 sm:py-14 lg:px-10">
        <div className="mx-auto h-28 max-w-[1500px] animate-pulse rounded-3xl border border-[var(--border)] bg-[var(--card)]" />
      </main>
    );
  }

  if (error || !selectedWorkspace) {
    return (
      <main className="min-h-screen px-5 py-10 sm:px-8 sm:py-14 lg:px-10">
        <div className="mx-auto max-w-[1500px] rounded-2xl border border-[#E4B9B9] bg-[#FFF0F0] px-5 py-4 text-sm text-[#8B3E3E]">
          {error ?? "No social media References workspace is available yet."}
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="border-b border-[var(--border)] bg-[var(--card)] px-5 py-3 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
            References workspace
          </p>
          <ClientSelect
            value={selectedWorkspace.clientSlug}
            onChange={selectWorkspace}
            options={workspaces.map((workspace) => ({
              value: workspace.clientSlug,
              label: workspace.clientName,
            }))}
            ariaLabel="Select social media references client"
            tone="themed"
          />
        </div>
      </div>
      <main className="min-h-screen px-5 pb-12 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1500px]">
          <SocialResearchLog
            key={selectedWorkspace.id}
            taskId={selectedWorkspace.id}
            clientId={selectedWorkspace.clientId}
          />
        </div>
      </main>
    </>
  );
}
