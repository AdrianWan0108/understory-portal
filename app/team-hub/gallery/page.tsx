"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClientSelect } from "@/app/_components/ClientSelect";
import { galleryImagePreviewUrl } from "@/lib/gallery-links";
import { projectClientInitial } from "@/lib/project-client-theme";
import { supabase } from "@/lib/supabase";
import {
  WORKSPACE_CLIENTS,
  WORKSPACE_CLIENT_SLUGS,
  type WorkspaceClientSlug,
} from "@/lib/workspace-clients";
import { useProjectTheme } from "../projects/_components/ProjectThemeProvider";

type GalleryBookRow = {
  id: string;
  title: string;
  created_at: string;
};

type GalleryPhotoRow = {
  id: string;
  book_id: string;
  drive_link: string | null;
  sort_order: number;
  created_at: string;
};

type GalleryBook = GalleryBookRow & {
  photoCount: number;
  coverLink: string | null;
};

function ClientMark({ client }: { client: WorkspaceClientSlug }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)] shadow-sm"
    >
      {projectClientInitial(client)}
    </span>
  );
}

function GalleryIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m4 17 5-5 3.5 3.5 2-2L20 19" />
    </svg>
  );
}

export default function TeamHubGalleryPage() {
  const { client, isReady, setClient } = useProjectTheme();
  const [books, setBooks] = useState<GalleryBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clientOptions = WORKSPACE_CLIENT_SLUGS.map((slug) => ({
    value: slug,
    label: WORKSPACE_CLIENTS[slug].name,
  }));

  useEffect(() => {
    if (!isReady) return;
    let isActive = true;

    async function loadGallery() {
      setIsLoading(true);
      setError(null);
      setBooks([]);

      const { data: clientRecord, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .eq("slug", client)
        .maybeSingle();

      if (!isActive) return;
      if (clientError || !clientRecord) {
        setError(
          `Could not load ${WORKSPACE_CLIENTS[client].name}: ${clientError?.message ?? "Client not found."}`,
        );
        setIsLoading(false);
        return;
      }

      const bookResult = await supabase
        .from("gallery_books")
        .select("id, title, created_at")
        .eq("client_id", clientRecord.id)
        .order("created_at", { ascending: true });

      if (!isActive) return;
      if (bookResult.error) {
        setError(`Could not load gallery books: ${bookResult.error.message}`);
        setIsLoading(false);
        return;
      }

      const bookRows = (bookResult.data ?? []) as GalleryBookRow[];
      const bookIds = bookRows.map((book) => book.id);
      const photoResult = bookIds.length
        ? await supabase
            .from("gallery_photos")
            .select("id, book_id, drive_link, sort_order, created_at")
            .in("book_id", bookIds)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true })
        : { data: [], error: null };

      if (!isActive) return;
      if (photoResult.error) {
        setError(`Could not load gallery photos: ${photoResult.error.message}`);
        setIsLoading(false);
        return;
      }

      const photosByBook = new Map<string, GalleryPhotoRow[]>();
      ((photoResult.data ?? []) as GalleryPhotoRow[]).forEach((photo) => {
        const photos = photosByBook.get(photo.book_id) ?? [];
        photos.push(photo);
        photosByBook.set(photo.book_id, photos);
      });

      setBooks(
        bookRows.map((book) => {
          const photos = photosByBook.get(book.id) ?? [];
          return {
            ...book,
            photoCount: photos.length,
            coverLink: photos[0]?.drive_link ?? null,
          };
        }),
      );
      setIsLoading(false);
    }

    void loadGallery();
    return () => {
      isActive = false;
    };
  }, [client, isReady]);

  return (
    <main className="px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">
              Team Hub · Client assets
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-4xl">
              Gallery
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)] sm:text-base">
              Choose a client to view the same photo books available in their
              client portal.
            </p>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--muted-foreground)] lg:text-right">
              Client
            </p>
            <div className="flex items-center gap-3">
              <ClientMark client={client} />
              <ClientSelect
                value={client}
                onChange={(value) =>
                  setClient(value as WorkspaceClientSlug)
                }
                options={clientOptions}
                ariaLabel="Select gallery client"
                tone="themed"
              />
            </div>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="mt-7 rounded-2xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
          >
            {error}
          </div>
        )}

        <section className="mt-10" aria-labelledby="team-gallery-books">
          <div className="flex items-end justify-between gap-4 border-b border-[var(--border)] pb-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--primary)]">
                {WORKSPACE_CLIENTS[client].name}
              </p>
              <h2
                id="team-gallery-books"
                className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]"
              >
                Photo books
              </h2>
            </div>
            {!isLoading && (
              <span className="rounded-full bg-[var(--muted)] px-3 py-1.5 text-[11px] font-semibold text-[var(--foreground)]">
                {books.length} {books.length === 1 ? "book" : "books"}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className="h-80 animate-pulse rounded-[24px] border border-[var(--border)] bg-[var(--card)]"
                />
              ))}
            </div>
          ) : books.length ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {books.map((book) => {
                const coverUrl = galleryImagePreviewUrl(book.coverLink, 900);
                return (
                  <Link
                    key={book.id}
                    href={`/team-hub/gallery/${book.id}?client=${client}`}
                    className="group overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--card)] shadow-[0_8px_28px_rgba(52,31,96,0.06)] transition hover:-translate-y-1 hover:border-[var(--primary)] hover:shadow-[0_14px_34px_rgba(52,31,96,0.12)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--ring)]"
                  >
                    <span className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-[var(--muted)] text-[var(--primary)]">
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt=""
                          className="size-full object-cover transition duration-500 group-hover:scale-[1.025]"
                        />
                      ) : (
                        <GalleryIcon />
                      )}
                    </span>
                    <span className="flex items-center justify-between gap-4 px-5 py-4">
                      <span className="min-w-0">
                        <span className="block truncate text-base font-semibold text-[var(--foreground)]">
                          {book.title}
                        </span>
                        <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
                          {book.photoCount}{" "}
                          {book.photoCount === 1 ? "photo" : "photos"}
                        </span>
                      </span>
                      <span className="text-lg text-[var(--primary)]">→</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            !error && (
              <div className="mt-6 rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center">
                <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[var(--muted)] text-[var(--primary)]">
                  <GalleryIcon />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-[var(--foreground)]">
                  No gallery books yet
                </h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Books created for this client will appear here automatically.
                </p>
              </div>
            )
          )}
        </section>
      </div>
    </main>
  );
}
