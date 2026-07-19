"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ClientRow = {
  id: string;
  name: string;
  slug: string;
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
  const [cards, setCards] = useState<ClientCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function load() {
      setIsLoading(true);
      const [clientsResult, profilesResult, photosResult] = await Promise.all([
        supabase.from("clients").select("id, name, slug").order("name"),
        supabase
          .from("client_profiles")
          .select("client_id, industry, overview"),
        supabase
          .from("client_profile_photos")
          .select("client_id, photo_url, created_at")
          .order("created_at", { ascending: true }),
      ]);

      if (!isActive) return;
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
    }

    void load();
    return () => {
      isActive = false;
    };
  }, []);

  return (
    <main className="px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header>
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
                  <h2 className="text-lg font-semibold text-[#341F60]">
                    {client.name}
                  </h2>
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
      </div>
    </main>
  );
}
