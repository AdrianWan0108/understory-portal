"use client";

/* eslint-disable @next/next/no-img-element */
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAdmin } from "../../_components/AdminContext";
import {
  AdminButton,
  AdminConfirmDialog,
  AdminEmpty,
  AdminMessage,
  AdminModal,
  AdminPageHeader,
  inputClass,
} from "../../_components/AdminUi";

type Book = { id: string; title: string; cover_note: string | null };
type Photo = {
  id: string;
  drive_link: string | null;
  caption: string | null;
  sort_order: number;
};

type PhotoEditor = {
  id?: string;
  driveLink: string;
  caption: string;
};

function previewUrl(link: string | null) {
  if (!link) return null;
  try {
    const url = new URL(link);
    const id =
      url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ??
      url.searchParams.get("id");
    return id
      ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1000`
      : link;
  } catch {
    return link;
  }
}

export default function AdminGalleryBookPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { clientId } = useAdmin();
  const [book, setBook] = useState<Book | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<PhotoEditor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Photo | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    const bookResult = await supabase
      .from("gallery_books")
      .select("id, title, cover_note")
      .eq("id", bookId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (bookResult.error || !bookResult.data) {
      setError(bookResult.error?.message ?? "Book not found for this client.");
      setBook(null);
      return;
    }
    setBook(bookResult.data as Book);
    const photoResult = await supabase
      .from("gallery_photos")
      .select("id, drive_link, caption, sort_order")
      .eq("book_id", bookId)
      .order("sort_order", { ascending: true });
    if (photoResult.error) setError(photoResult.error.message);
    else {
      setPhotos((photoResult.data ?? []) as Photo[]);
      setError(null);
    }
  }, [bookId, clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePhoto() {
    if (!editor || !editor.driveLink.trim() || isSaving) return;
    setIsSaving(true);
    setError(null);
    const payload = {
      drive_link: editor.driveLink.trim(),
      caption: editor.caption.trim() || null,
    };
    const { error: mutationError } = editor.id
      ? await supabase
          .from("gallery_photos")
          .update(payload)
          .eq("id", editor.id)
      : await supabase.from("gallery_photos").insert({
          book_id: bookId,
          ...payload,
          sort_order: photos.length,
        });
    setIsSaving(false);
    if (mutationError) {
      setError(mutationError.message);
      return;
    }
    setEditor(null);
    void load();
  }

  async function deletePhoto() {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    const { error: mutationError } = await supabase
      .from("gallery_photos")
      .delete()
      .eq("id", deleteTarget.id);
    setIsDeleting(false);
    if (mutationError) {
      setError(mutationError.message);
      return;
    }
    setDeleteTarget(null);
    void load();
  }

  return (
    <main className="px-5 py-10 sm:px-8 lg:px-10">
      <Link
        href="/admin/gallery"
        className="mb-5 inline-flex text-xs font-semibold text-[#7D4698]"
      >
        ← Back to gallery
      </Link>
      <AdminPageHeader
        title={book?.title ?? "Gallery book"}
        description="Add and remove Google Drive-linked photos in this album."
        action={
          <AdminButton
            onClick={() => setEditor({ driveLink: "", caption: "" })}
            disabled={!book}
          >
            + Add photo
          </AdminButton>
        }
      />
      <AdminMessage error={error} />
      <div className="mt-7 columns-1 gap-4 sm:columns-2 xl:columns-3">
        {photos.length ? (
          photos.map((photo) => (
            <article
              key={photo.id}
              className="mb-4 break-inside-avoid overflow-hidden rounded-[20px] border border-[#D7CBE0] bg-white"
            >
              {previewUrl(photo.drive_link) ? (
                <img
                  src={previewUrl(photo.drive_link) ?? ""}
                  alt={photo.caption ?? "Gallery photo"}
                  className="max-h-[430px] w-full object-cover"
                />
              ) : (
                <div className="aspect-square bg-[#EEE3FA]" />
              )}
              <div className="p-4">
                {photo.caption && (
                  <p className="text-sm text-[#6C5A78]">{photo.caption}</p>
                )}
                <div className={`flex gap-2 ${photo.caption ? "mt-3" : ""}`}>
                  <AdminButton
                    tone="secondary"
                    onClick={() =>
                      setEditor({
                        id: photo.id,
                        driveLink: photo.drive_link ?? "",
                        caption: photo.caption ?? "",
                      })
                    }
                  >
                    Edit
                  </AdminButton>
                  <AdminButton
                    tone="danger"
                    onClick={() => setDeleteTarget(photo)}
                  >
                    Delete
                  </AdminButton>
                </div>
              </div>
            </article>
          ))
        ) : (
          <AdminEmpty>No photos in this book yet.</AdminEmpty>
        )}
      </div>

      <AdminModal
        open={Boolean(editor)}
        title={`${editor?.id ? "Edit" : "Add"} gallery photo`}
        description="Paste a publicly shared Google Drive image link."
        submitLabel={editor?.id ? "Save changes" : "Add photo"}
        isSaving={isSaving}
        submitDisabled={!editor?.driveLink.trim()}
        onClose={() => setEditor(null)}
        onSubmit={(event) => {
          event.preventDefault();
          void savePhoto();
        }}
      >
        {editor && (
          <div className="grid gap-4">
            <label className="text-xs font-semibold text-[#341F60]">
              Google Drive image link
              <input
                autoFocus
                type="url"
                value={editor.driveLink}
                onChange={(event) =>
                  setEditor({ ...editor, driveLink: event.target.value })
                }
                placeholder="https://drive.google.com/file/d/..."
                className={`mt-2 ${inputClass}`}
              />
            </label>
            <p className="-mt-2 text-[11px] leading-5 text-[#75647F]">
              Make sure the file is shared as “Anyone with the link can view.”
            </p>
            <label className="text-xs font-semibold text-[#341F60]">
              Caption
              <textarea
                rows={3}
                value={editor.caption}
                onChange={(event) =>
                  setEditor({ ...editor, caption: event.target.value })
                }
                className={`mt-2 resize-y ${inputClass}`}
              />
            </label>
          </div>
        )}
      </AdminModal>

      <AdminConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete gallery photo?"
        description="This permanently removes the photo record from this gallery book."
        isWorking={isDeleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deletePhoto()}
      />
    </main>
  );
}
