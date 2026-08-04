"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useClientIdentity } from "../_components/ClientIdentity";

type GalleryBook = {
  id: string;
  client_id: string;
  title: string;
  cover_note: string | null;
  created_at: string;
  photoCount: number;
};

const coverStyles = [
  {
    cover: "bg-primary text-primary-foreground",
    spine: "bg-primary/90",
    detail: "border-current/25 text-current/70",
  },
  {
    cover: "bg-muted text-foreground",
    spine: "bg-secondary",
    detail: "border-primary/20 text-muted-foreground",
  },
  {
    cover: "bg-foreground text-white",
    spine: "bg-foreground/85",
    detail: "border-white/20 text-white/65",
  },
];

function ArrowIcon() {
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
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export default function GalleryPage() {
  const { clientSlug, clientName } = useClientIdentity();
  const [books, setBooks] = useState<GalleryBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadBooks() {
      setIsLoading(true);
      setBooks([]);

      if (!clientSlug) {
        setErrorMessage("Choose a client profile to view the gallery.");
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

      const { data, error } = await supabase
        .from("gallery_books")
        .select("id, client_id, title, cover_note, created_at")
        .eq("client_id", client.id)
        .order("created_at", { ascending: true });

      if (!isActive) return;
      if (error) {
        setErrorMessage(`Could not load gallery books: ${error.message}`);
        setBooks([]);
      } else {
        const bookRows = data ?? [];
        const bookIds = bookRows.map((book) => book.id);
        const photoResult = bookIds.length
          ? await supabase
              .from("gallery_photos")
              .select("book_id")
              .in("book_id", bookIds)
          : { data: [], error: null };

        if (!isActive) return;
        if (photoResult.error) {
          setErrorMessage(
            `Could not load gallery photo counts: ${photoResult.error.message}`,
          );
          setBooks([]);
        } else {
          const photoCounts = new Map<string, number>();
          (photoResult.data ?? []).forEach((photo) => {
            photoCounts.set(
              photo.book_id,
              (photoCounts.get(photo.book_id) ?? 0) + 1,
            );
          });
          setBooks(
            bookRows.map((book) => ({
              ...book,
              photoCount: photoCounts.get(book.id) ?? 0,
            })) as GalleryBook[],
          );
          setErrorMessage(null);
        }
      }

      setIsLoading(false);
    }

    void loadBooks();
    return () => {
      isActive = false;
    };
  }, [clientName, clientSlug]);

  return (
    <main className="min-h-screen overflow-hidden px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            Client portal · {clientName ?? "Client"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
            Gallery
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Browse project photography and event moments by album.
          </p>
        </header>

        {errorMessage && (
          <div
            role="alert"
            className="mt-7 rounded-2xl border border-accent bg-accent/20 px-4 py-3 text-sm leading-6 text-accent-foreground"
          >
            {errorMessage}
          </div>
        )}

        <section className="mt-10" aria-labelledby="gallery-books-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-muted-foreground">
                Photo library
              </p>
              <h2
                id="gallery-books-heading"
                className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground"
              >
                Albums
              </h2>
            </div>
            {!isLoading && (
              <span className="rounded-full bg-muted px-3 py-1.5 text-[11px] font-semibold text-secondary-foreground">
                {books.length} books
              </span>
            )}
          </div>

          <div className="relative mt-6">
            <div className="overflow-x-auto pb-8 pt-2 [scrollbar-color:var(--input)_transparent] [scrollbar-width:thin]">
              <div className="flex min-w-max items-end gap-3 px-1 sm:gap-4">
                {isLoading
                  ? Array.from({ length: 3 }, (_, index) => (
                      <div
                        key={index}
                        className="aspect-[2/3] w-40 animate-pulse rounded-r-xl rounded-l-sm border border-border bg-card sm:w-44"
                      />
                    ))
                  : books.map((book, index) => {
                      const style = coverStyles[index % coverStyles.length];

                      return (
                        <Link
                          key={book.id}
                          href={`/client-portal/gallery/${book.id}`}
                          aria-label={`Open ${book.title} album`}
                          className={`group relative aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-r-xl rounded-l-sm border border-foreground/10 shadow-[8px_10px_24px_rgba(52,31,96,0.12)] transition duration-300 hover:-translate-y-2 hover:shadow-[10px_18px_32px_rgba(52,31,96,0.18)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:w-44 ${style.cover}`}
                        >
                          <span
                            className={`absolute inset-y-0 left-0 w-8 border-r border-black/10 shadow-[4px_0_10px_rgba(0,0,0,0.08)] ${style.spine}`}
                          />
                          <span className="absolute inset-y-5 left-1.5 flex w-5 items-center justify-center">
                            <span
                              className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.18em] opacity-70"
                              style={{
                                writingMode: "vertical-rl",
                                transform: "rotate(180deg)",
                              }}
                            >
                              {clientName ?? "Client"} gallery
                            </span>
                          </span>

                          <span className="absolute inset-x-0 top-0 h-px bg-card/35" />
                          <span className="absolute bottom-0 right-0 top-0 w-px bg-black/10" />

                          <span className="flex h-full flex-col justify-between py-6 pl-12 pr-5">
                            <span className="flex size-8 items-center justify-center rounded-full border border-current/25 text-[10px] font-semibold opacity-80">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span>
                              <span className="block text-xl font-semibold leading-tight tracking-[-0.025em]">
                                {book.title}
                              </span>
                              <span
                                className={`mt-4 flex items-center justify-between gap-2 border-t pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] ${style.detail}`}
                              >
                                {book.photoCount}{" "}
                                {book.photoCount === 1 ? "photo" : "photos"}
                                <ArrowIcon />
                              </span>
                            </span>
                          </span>
                        </Link>
                      );
                    })}
              </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-5 h-3 rounded-full bg-[linear-gradient(180deg,var(--muted)_0%,var(--secondary)_45%,var(--primary)_46%,var(--border)_100%)] shadow-[0_7px_14px_rgba(52,31,96,0.12)]" />
          </div>

          {!isLoading && books.length === 0 && !errorMessage && (
            <div className="mt-6 rounded-[24px] border border-dashed border-border bg-card px-6 py-12 text-center">
              <p className="text-sm font-semibold text-foreground">
                No gallery books yet.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                New albums will appear here when they are ready.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
