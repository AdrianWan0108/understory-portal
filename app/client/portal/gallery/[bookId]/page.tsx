"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClientIdentity } from "../../_components/ClientIdentity";

type GalleryBook = {
  id: string;
  client_id: string;
  title: string;
  cover_note: string | null;
  created_at: string;
};

type GalleryPhoto = {
  id: string;
  book_id: string;
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

function extractGoogleDriveFileId(value: string) {
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    if (
      hostname !== "drive.google.com" &&
      hostname !== "docs.google.com"
    ) {
      return null;
    }

    const pathMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    return pathMatch?.[1] ?? url.searchParams.get("id");
  } catch {
    return null;
  }
}

function getImagePreviewUrl(rawUrl: string | null | undefined) {
  if (!rawUrl) return null;
  const fileId = extractGoogleDriveFileId(rawUrl);
  return fileId
    ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1000`
    : rawUrl;
}

function PhotoPreview({
  photo,
  index,
}: {
  photo: GalleryPhoto;
  index: number;
}) {
  const previewUrl = getImagePreviewUrl(photo.drive_link);
  const [hasFailed, setHasFailed] = useState(false);
  const aspectClass = photoAspectClasses[index % photoAspectClasses.length];

  return (
    <figure className="mb-4 break-inside-avoid overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_7px_24px_rgba(52,31,96,0.065)]">
      <div
        className={`relative overflow-hidden bg-[linear-gradient(135deg,var(--muted),var(--background))] ${aspectClass}`}
      >
        {previewUrl && !hasFailed ? (
          <img
            src={previewUrl}
            alt={photo.caption ?? `Gallery photo ${index + 1}`}
            className="size-full object-cover transition duration-500 hover:scale-[1.02]"
            onError={() => setHasFailed(true)}
          />
        ) : (
          <div className="flex size-full items-center justify-center px-6 text-center">
            <div>
              <span className="mx-auto flex size-10 items-center justify-center rounded-2xl bg-card/80 text-primary shadow-sm">
                <svg
                  aria-hidden="true"
                  className="size-5"
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
              </span>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Photo preview unavailable
              </p>
            </div>
          </div>
        )}
      </div>

      {photo.caption && (
        <figcaption className="px-4 py-3.5 text-sm leading-6 text-muted-foreground">
          {photo.caption}
        </figcaption>
      )}
    </figure>
  );
}

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export default function GalleryAlbumPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { clientSlug, clientName } = useClientIdentity();
  const [book, setBook] = useState<GalleryBook | null>(null);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadAlbum() {
      setIsLoading(true);
      setBook(null);
      setPhotos([]);

      if (!clientSlug) {
        setErrorMessage("Choose a client profile to view this album.");
        setIsLoading(false);
        return;
      }

      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .eq("slug", clientSlug)
        .single();

      if (!isActive) return;
      if (clientError || !client) {
        setErrorMessage(
          `Could not load ${clientName ?? "the selected client"}: ${clientError?.message ?? "Client not found."}`,
        );
        setIsLoading(false);
        return;
      }

      const bookResult = await supabase
        .from("gallery_books")
        .select("id, client_id, title, cover_note, created_at")
        .eq("id", bookId)
        .eq("client_id", client.id)
        .maybeSingle();

      if (!isActive) return;
      if (bookResult.error || !bookResult.data) {
        setErrorMessage(
          bookResult.error
            ? `Could not load this album: ${bookResult.error.message}`
            : `This album is not available for ${clientName ?? "the selected client"}.`,
        );
        setIsLoading(false);
        return;
      }

      const photoResult = await supabase
        .from("gallery_photos")
        .select("id, book_id, drive_link, caption, sort_order, created_at")
        .eq("book_id", bookResult.data.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (!isActive) return;

      if (photoResult.error) {
        setErrorMessage(`Could not load photos: ${photoResult.error.message}`);
        setBook(bookResult.data as GalleryBook);
        setPhotos([]);
      } else {
        setBook(bookResult.data as GalleryBook);
        setPhotos((photoResult.data ?? []) as GalleryPhoto[]);
        setErrorMessage(null);
      }

      setIsLoading(false);
    }

    void loadAlbum();
    return () => {
      isActive = false;
    };
  }, [bookId, clientName, clientSlug]);

  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/client-portal/gallery"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold text-secondary-foreground transition hover:border-input hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <BackIcon />
          Back to Gallery
        </Link>

        {isLoading ? (
          <div className="mt-8">
            <div className="h-10 w-64 animate-pulse rounded-xl bg-muted" />
            <div className="mt-3 h-5 w-36 animate-pulse rounded-lg bg-muted" />
            <div className="mt-10 columns-1 gap-4 sm:columns-2 lg:columns-3">
              {["h-72", "h-52", "h-80", "h-60", "h-72"].map(
                (height, index) => (
                  <div
                    key={index}
                    className={`mb-4 break-inside-avoid animate-pulse rounded-[20px] border border-border bg-card ${height}`}
                  />
                ),
              )}
            </div>
          </div>
        ) : (
          <>
            <header className="mt-8 border-b border-border pb-7">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                Gallery album
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
                {book?.title ?? "Album unavailable"}
              </h1>
              {book && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {photos.length} {photos.length === 1 ? "photo" : "photos"}
                </p>
              )}
            </header>

            {errorMessage && (
              <div
                role="alert"
                className="mt-7 rounded-2xl border border-accent bg-accent/20 px-4 py-3 text-sm leading-6 text-accent-foreground"
              >
                {errorMessage}
              </div>
            )}

            {book && photos.length > 0 ? (
              <section
                aria-label={`${book.title} photos`}
                className="mt-8 columns-1 gap-4 sm:columns-2 lg:columns-3"
              >
                {photos.map((photo, index) => (
                  <PhotoPreview key={photo.id} photo={photo} index={index} />
                ))}
              </section>
            ) : (
              book &&
              !errorMessage && (
                <section className="mt-8 rounded-[28px] border border-dashed border-border bg-card px-6 py-16 text-center shadow-[0_8px_28px_rgba(52,31,96,0.035)]">
                  <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-primary">
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
                      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h3l2 2h6A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2h-11A2.5 2.5 0 0 1 4 17Z" />
                      <path d="m8 15 2.5-2.5 2 2 1.5-1.5 2 2" />
                    </svg>
                  </span>
                  <h2 className="mt-5 text-xl font-semibold text-foreground">
                    No photos in this album yet.
                  </h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Photos added to this book will appear here automatically.
                  </p>
                </section>
              )
            )}
          </>
        )}
      </div>
    </main>
  );
}
