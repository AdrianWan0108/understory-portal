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

type DriveFolderFile = {
  id: string;
  name: string;
  mimeType: string;
  driveLink: string;
};

type DriveFolderImporter = {
  folderLink: string;
  files: DriveFolderFile[] | null;
  truncated: boolean;
};

function driveFileId(link: string | null) {
  if (!link) return null;
  try {
    const url = new URL(link);
    return (
      url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ??
      url.searchParams.get("id")
    );
  } catch {
    return null;
  }
}

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
  const [folderImporter, setFolderImporter] =
    useState<DriveFolderImporter | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Photo | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isImportingFolder, setIsImportingFolder] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

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
    setSuccess(editor.id ? "Photo updated." : "Photo added.");
    void load();
  }

  async function scanDriveFolder() {
    if (!folderImporter?.folderLink.trim() || isImportingFolder) return;
    setIsImportingFolder(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/gallery/drive-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderUrl: folderImporter.folderLink.trim() }),
      });
      const result = (await response.json()) as {
        files?: DriveFolderFile[];
        truncated?: boolean;
        error?: string;
      };

      if (!response.ok) {
        setError(result.error ?? "Could not read the Google Drive folder.");
        return;
      }

      setFolderImporter((current) =>
        current
          ? {
              ...current,
              files: result.files ?? [],
              truncated: Boolean(result.truncated),
            }
          : null,
      );
    } catch {
      setError("Could not reach the Google Drive folder importer.");
    } finally {
      setIsImportingFolder(false);
    }
  }

  async function importDriveFolder() {
    if (!folderImporter?.files || isImportingFolder) return;

    const existingFileIds = new Set(
      photos
        .map((photo) => driveFileId(photo.drive_link))
        .filter((id): id is string => Boolean(id)),
    );
    const filesToImport = folderImporter.files.filter(
      (file) => !existingFileIds.has(file.id),
    );
    const skippedCount = folderImporter.files.length - filesToImport.length;

    if (!filesToImport.length) {
      setFolderImporter(null);
      setSuccess("Every image in this Drive folder is already in the album.");
      return;
    }

    setIsImportingFolder(true);
    setError(null);
    setSuccess(null);
    const { error: importError } = await supabase
      .from("gallery_photos")
      .insert(
        filesToImport.map((file, index) => ({
          book_id: bookId,
          drive_link: file.driveLink,
          caption: null,
          sort_order: photos.length + index,
        })),
      );
    setIsImportingFolder(false);

    if (importError) {
      setError(importError.message);
      return;
    }

    setFolderImporter(null);
    setSuccess(
      `Imported ${filesToImport.length} ${filesToImport.length === 1 ? "photo" : "photos"}${
        skippedCount
          ? ` and skipped ${skippedCount} already in this album`
          : ""
      }.`,
    );
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
          <div className="flex flex-wrap gap-2">
            <AdminButton
              tone="secondary"
              onClick={() => {
                setError(null);
                setFolderImporter({
                  folderLink: "",
                  files: null,
                  truncated: false,
                });
              }}
              disabled={!book}
            >
              Import Drive folder
            </AdminButton>
            <AdminButton
              onClick={() => setEditor({ driveLink: "", caption: "" })}
              disabled={!book}
            >
              + Add photo
            </AdminButton>
          </div>
        }
      />
      <AdminMessage error={error} success={success} />
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
                {photo.drive_link && (
                  <a
                    href={photo.drive_link}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex text-xs font-semibold text-[#477B99] hover:underline ${photo.caption ? "mt-2" : ""}`}
                  >
                    Open in Google Drive ↗
                  </a>
                )}
                <div className="mt-3 flex gap-2">
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

      <AdminModal
        open={Boolean(folderImporter)}
        title="Import a Google Drive folder"
        description="Paste one publicly shared folder link. Each image is listed first, then imported into this album with its own Drive link."
        submitLabel={
          folderImporter?.files
            ? `Import ${folderImporter.files.length} ${folderImporter.files.length === 1 ? "photo" : "photos"}`
            : "List folder files"
        }
        isSaving={isImportingFolder}
        submitDisabled={
          !folderImporter?.folderLink.trim() ||
          (folderImporter.files !== null && folderImporter.files.length === 0)
        }
        maxWidth="xl"
        onClose={() => {
          setFolderImporter(null);
          setError(null);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (folderImporter?.files) void importDriveFolder();
          else void scanDriveFolder();
        }}
      >
        {folderImporter && (
          <div className="grid gap-5">
            <AdminMessage error={error} />
            <label className="text-xs font-semibold text-[#341F60]">
              Google Drive folder link
              <input
                autoFocus
                type="url"
                value={folderImporter.folderLink}
                onChange={(event) => {
                  setError(null);
                  setFolderImporter({
                    folderLink: event.target.value,
                    files: null,
                    truncated: false,
                  });
                }}
                placeholder="https://drive.google.com/drive/folders/..."
                className={`mt-2 ${inputClass}`}
              />
            </label>

            {folderImporter.files && (
              <section>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[#341F60]">
                    {folderImporter.files.length}{" "}
                    {folderImporter.files.length === 1
                      ? "image found"
                      : "images found"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => void scanDriveFolder()}
                    disabled={isImportingFolder}
                    className="text-xs font-semibold text-[#7D4698] hover:underline disabled:opacity-45"
                  >
                    Refresh list
                  </button>
                </div>

                {folderImporter.truncated && (
                  <p className="mt-2 text-xs leading-5 text-[#8B6538]">
                    Only the first 1,000 images are shown for this import.
                  </p>
                )}

                {folderImporter.files.length ? (
                  <ol className="mt-3 divide-y divide-[#E2D7E8] overflow-hidden rounded-xl border border-[#D7CBE0] bg-white">
                    {folderImporter.files.map((file, index) => (
                      <li
                        key={file.id}
                        className="flex items-center gap-3 px-3.5 py-3"
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#EEE3FA] text-[10px] font-semibold text-[#5F3378]">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[#341F60]">
                            {file.name}
                          </span>
                          <span className="block truncate text-[11px] text-[#8B7894]">
                            {file.driveLink}
                          </span>
                        </span>
                        <a
                          href={file.driveLink}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-xs font-semibold text-[#477B99] hover:underline"
                        >
                          Open ↗
                        </a>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed border-[#CDBAD9] bg-white px-4 py-8 text-center text-sm text-[#75647F]">
                    No image files were found in this folder.
                  </div>
                )}
              </section>
            )}

            <p className="text-[11px] leading-5 text-[#75647F]">
              The folder and its image files must be shared as “Anyone with the
              link can view.” Subfolders are included automatically. Files
              already in this album are skipped.
            </p>
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
