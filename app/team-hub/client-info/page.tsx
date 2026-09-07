"use client";

/* eslint-disable @next/next/no-img-element */
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { slugifyClientName } from "@/lib/client-management";
import { supabase } from "@/lib/supabase";
import { useTeamIdentity } from "../_components/TeamIdentity";
import {
  TeamButton,
  TeamModal,
  teamInputClass,
} from "../_components/TeamHubUi";

type ClientRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
};

type ClientProfileSummary = {
  client_id: string;
  industry: string | null;
  overview: string | null;
};

type ClientCard = ClientRow & {
  industry: string | null;
  overview: string | null;
  photoUrl: string | null;
};

export default function TeamHubClientInfoPage() {
  const router = useRouter();
  const { accessLevel } = useTeamIdentity();
  const [cards, setCards] = useState<ClientCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientSlug, setNewClientSlug] = useState("");
  const [addClientError, setAddClientError] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    setIsLoading(true);
    const [clientsResult, profilesResult, photosResult] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name, slug, logo_url")
        .order("name"),
      supabase
        .from("client_profiles")
        .select("client_id, industry, overview"),
      supabase
        .from("client_profile_photos")
        .select("client_id, photo_url, created_at")
        .order("created_at", { ascending: true }),
    ]);

    const loadError =
      clientsResult.error || profilesResult.error || photosResult.error;
    if (loadError) {
      setError(`Could not load clients: ${loadError.message}`);
      setIsLoading(false);
      return;
    }

    const profileByClient = new Map<string, ClientProfileSummary>();
    (profilesResult.data ?? []).forEach((profile) => {
      profileByClient.set(profile.client_id, profile);
    });
    const firstPhotoByClient = new Map<string, string>();
    (photosResult.data ?? []).forEach((photo) => {
      if (!firstPhotoByClient.has(photo.client_id)) {
        firstPhotoByClient.set(photo.client_id, photo.photo_url);
      }
    });

    setCards(
      ((clientsResult.data ?? []) as ClientRow[]).map((client) => {
        const profile = profileByClient.get(client.id);
        return {
          ...client,
          industry: profile?.industry ?? null,
          overview: profile?.overview ?? null,
          photoUrl: firstPhotoByClient.get(client.id) ?? null,
        };
      }),
    );
    setError(null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  async function addClient() {
    if (!newClientName.trim() || !newClientSlug.trim() || isSavingClient) return;
    setIsSavingClient(true);
    setAddClientError(null);
    try {
      const response = await fetch("/api/team-hub/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newClientName, slug: newClientSlug }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAddClientError(body.error ?? "Could not add the client.");
        return;
      }
      const client = body.client as ClientRow;
      setIsAddingClient(false);
      setNewClientName("");
      setNewClientSlug("");
      router.push(`/team-hub/client-info/${client.slug}`);
    } catch {
      setAddClientError("Could not reach the server.");
    } finally {
      setIsSavingClient(false);
    }
  }

  return (
    <main className="px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7D4698]">
              Team Hub · Client info
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#28154F] sm:text-4xl">
              Client info
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#75647F] sm:text-base">
              Deep-dive research on each client: who they are, who runs the
              business, marketing and business insights, and photos — so
              everyone on the team can understand the business before doing
              the work.
            </p>
          </div>
          {accessLevel === "owner" && (
            <TeamButton
              type="button"
              className="shrink-0 self-start sm:self-auto"
              onClick={() => {
                setAddClientError(null);
                setIsAddingClient(true);
              }}
            >
              + Add client
            </TeamButton>
          )}
        </header>

        {error && (
          <div
            role="alert"
            className="mt-7 rounded-2xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
          >
            {error}
          </div>
        )}

        <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <>
              <div className="h-64 animate-pulse rounded-[24px] bg-[#EEE3FA]" />
              <div className="h-64 animate-pulse rounded-[24px] bg-[#EEE3FA]" />
              <div className="h-64 animate-pulse rounded-[24px] bg-[#EEE3FA]" />
            </>
          ) : (
            cards.map((client) => (
              <Link
                key={client.id}
                href={`/team-hub/client-info/${client.slug}`}
                className="group overflow-hidden rounded-[24px] border border-[#D7CBE0] bg-white shadow-[0_8px_28px_rgba(40,21,79,0.055)] transition hover:-translate-y-1 hover:border-[#7D4698] hover:shadow-[0_14px_34px_rgba(40,21,79,0.11)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
              >
                {client.photoUrl ? (
                  <img
                    src={client.photoUrl}
                    alt={client.name}
                    className="aspect-[16/9] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[16/9] items-center justify-center bg-[#EEE3FA] text-xs font-semibold text-[#7D4698]">
                    No photos yet
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-center gap-2">
                    {client.logo_url ? (
                      <img
                        src={client.logo_url}
                        alt=""
                        className="h-6 w-6 rounded-full border border-[#D7CBE0] bg-white object-contain"
                      />
                    ) : null}
                    <h2 className="text-lg font-semibold text-[#341F60]">
                      {client.name}
                    </h2>
                  </div>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#8B7895]">
                    {client.industry || "Industry not set"}
                  </p>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#75647F]">
                    {client.overview || "No research written yet."}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-[#7D4698]">
                    View client info
                    <span className="transition group-hover:translate-x-1">
                      →
                    </span>
                  </span>
                </div>
              </Link>
            ))
          )}
        </section>

        <TeamModal
          open={isAddingClient}
          title="Add client"
          description="Create the client workspace, then add its research and photos."
          submitLabel="Create client"
          isSaving={isSavingClient}
          submitDisabled={!newClientName.trim() || !newClientSlug.trim()}
          onClose={() => {
            if (!isSavingClient) setIsAddingClient(false);
          }}
          onSubmit={(event) => {
            event.preventDefault();
            void addClient();
          }}
        >
          {addClientError && (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
            >
              {addClientError}
            </p>
          )}
          <div className="grid gap-4">
            <label className="text-xs font-semibold text-[#341F60]">
              Client name
              <input
                autoFocus
                value={newClientName}
                onChange={(event) => {
                  const previousAutoSlug = slugifyClientName(newClientName);
                  const nextName = event.target.value;
                  setNewClientName(nextName);
                  if (!newClientSlug || newClientSlug === previousAutoSlug) {
                    setNewClientSlug(slugifyClientName(nextName));
                  }
                }}
                placeholder="e.g. North Shore Coffee"
                className={`mt-2 ${teamInputClass}`}
              />
            </label>
            <label className="text-xs font-semibold text-[#341F60]">
              Portal URL slug
              <input
                value={newClientSlug}
                onChange={(event) =>
                  setNewClientSlug(slugifyClientName(event.target.value))
                }
                placeholder="north-shore-coffee"
                className={`mt-2 ${teamInputClass}`}
              />
              <span className="mt-1.5 block font-normal text-[#8B7895]">
                Lowercase letters, numbers, and hyphens only.
              </span>
            </label>
          </div>
        </TeamModal>
      </div>
    </main>
  );
}
