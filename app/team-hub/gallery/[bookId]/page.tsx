"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  galleryImageDownloadUrl,
  galleryImagePreviewUrl,
} from "@/lib/gallery-links";
import { supabase } from "@/lib/supabase";
import { WORKSPACE_CLIENTS } from "@/lib/workspace-clients";
import { useProjectTheme } from "../../projects/_components/ProjectThemeProvider";

type GalleryBook = {
  id: string;
  title: string;
};

type GalleryPhoto = {
  id: string;
  drive_link: string | null;
  caption: string | null;
  sort_order: number;
  created_at: string;
};

const photoAspectClasses = [
  "aspect-[4/5]",
  "aspect-square",
  "aspect-[3/4]",
  "aspect-[5/4]",
  "aspect-[2/3]",
  "aspect-[4/3]",
];

function DownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" />
    </svg>
  );
}

function PhotoCard({ photo, index }: { photo: GalleryPhoto; index: number }) {
  const previewUrl = galleryImagePreviewUrl(photo.drive_link);
  const downloadUrl = galleryImageDownloadUrl(photo.drive_link);
  const [hasFailed, setHasFailed] = useState(false);

  return (
    <figure className="group mb-4 break-inside-avoid overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--card)] shadow-[0_7px_24px_rgba(52,31,96,0.065)]">
      <div
        className={`relative overflow-hidden bg-[var(--muted)] ${photoAspectClasses[index % photoAspectClasses.length]}`}
      >
        {previewUrl && !hasFailed ? (
          <>
            <img
              src={previewUrl}
              alt={photo.caption ?? `Gallery photo ${index + 1}`}
              className="size-full object-cover transition duration-500 group-hover:scale-[1.02]"
              onError={() => setHasFailed(true)}
            />
            {downloadUrl && (
              <a
                href={downloadUrl}
                download
                aria-label={`Download ${photo.caption ?? `gallery photo ${index + 1}`}`}
                className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--foreground)]/85 px-3 py-2 text-[11px] font-semibold text-[var(--background)] opacity-100 shadow-lg backdrop-blur transition hover:bg-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
              >
                <DownloadIcon />
                Download
              </a>
            )}
          </>
        ) : (
          <div className="flex size-full items-center justify-center px-6 text-center text-sm text-[var(--muted-foreground)]">
            Photo preview unavailable
          </div>
        )}
      </div>
      {photo.caption && (
        <figcaption className="px-4 py-3.5 text-sm leading-6 text-[var(--muted-foreground)]">
          {photo.caption}
        </figcaption>
      )}
    </figure>
  );
}

export default function TeamHubGalleryAlbumPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { client, isReady } = useProjectTheme();
  const [book, setBook] = useState<GalleryBook | null>(null);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    let isActive = true;

    async function loadAlbum() {
      setIsLoading(true);
      setError(null);
      setBook(null);
      setPhotos([]);

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
        .select("id, title")
        .eq("id", bookId)
        .eq("client_id", clientRecord.id)
        .maybeSingle();

      if (!isActive) return;
      if (bookResult.error || !bookResult.data) {
        setError(
          bookResult.error?.message ??
            `This album is not available for ${WORKSPACE_CLIENTS[client].name}.`,
        );
        setIsLoading(false);
        return;
      }

      const photoResult = await supabase
        .from("gallery_photos")
        .select("id, drive_link, caption, sort_order, created_at")
        .eq("book_id", bookResult.data.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (!isActive) return;
      if (photoResult.error) {
        setError(`Could not load gallery photos: ${photoResult.error.message}`);
      } else {
        setBook(bookResult.data as GalleryBook);
        setPhotos((photoResult.data ?? []) as GalleryPhoto[]);
      }
      setIsLoading(false);
    }

    void loadAlbum();
    return () => {
      isActive = false;
    };
  }, [bookId, client, isReady]);

  return (
    <main className="px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <Link
          href={`/team-hub/gallery?client=${client}`}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          ← Back to Gallery
        </Link>

        <header className="mt-8 border-b border-[var(--border)] pb-7">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">
            {WORKSPACE_CLIENTS[client].name} · Gallery album
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-4xl">
            {book?.title ?? (isLoading ? "Loading album…" : "Album unavailable")}
          </h1>
          {book && (
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">
              {photos.length} {photos.length === 1 ? "photo" : "photos"}
            </p>
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

        {isLoading ? (
          <div className="mt-8 columns-1 gap-4 sm:columns-2 lg:columns-3">
            {Array.from({ length: 5 }, (_, index) => (
              <div
                key={index}
                className="mb-4 h-64 break-inside-avoid animate-pulse rounded-[20px] border border-[var(--border)] bg-[var(--card)]"
              />
            ))}
          </div>
        ) : photos.length ? (
          <section
            aria-label={`${book?.title ?? "Gallery"} photos`}
            className="mt-8 columns-1 gap-4 sm:columns-2 lg:columns-3"
          >
            {photos.map((photo, index) => (
              <PhotoCard key={photo.id} photo={photo} index={index} />
            ))}
          </section>
        ) : (
          book &&
          !error && (
            <div className="mt-8 rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center text-sm text-[var(--muted-foreground)]">
              No photos in this album yet.
            </div>
          )
        )}
      </div>
    </main>
  );
}
