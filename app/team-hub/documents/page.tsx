"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  TEAM_IDENTITIES,
  useTeamIdentity,
} from "../_components/TeamIdentity";
import {
  TeamButton,
  TeamModal,
  teamInputClass,
} from "../_components/TeamHubUi";

const BUCKET = "team-documents";

type TeamDocument = {
  id: string;
  owner_username: string;
  file_url: string;
  document_name: string;
  category: string | null;
  created_at: string;
};

type DocumentEditor = {
  record?: TeamDocument;
  ownerUsername: string;
  documentName: string;
  category: string;
  file: File | null;
};

const profiles = Object.values(TEAM_IDENTITIES);
const profileByUsername = profiles.reduce<
  Record<string, { name: string; title: string }>
>((result, profile) => {
  result[profile.username] = { name: profile.name, title: profile.title };
  return result;
}, {});

function storagePath(url: string | null) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  try {
    const parsed = new URL(url);
    const index = parsed.pathname.indexOf(marker);
    return index < 0
      ? null
      : decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

export default function TeamHubDocumentsPage() {
  const { username, name, accessLevel, isReady } = useTeamIdentity();
  const [documents, setDocuments] = useState<TeamDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<DocumentEditor | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    if (!isReady || !username || !accessLevel) return;
    setIsLoading(true);
    setDocuments([]);
    let query = supabase
      .from("team_documents")
      .select(
        "id, owner_username, file_url, document_name, category, created_at",
      )
      .order("created_at", { ascending: false });
    if (accessLevel === "staff") {
      query = query.eq("owner_username", username);
    }
    const { data, error: loadError } = await query;
    if (loadError) {
      setError(`Could not load documents: ${loadError.message}`);
    } else {
      setDocuments((data ?? []) as TeamDocument[]);
      setError(null);
    }
    setIsLoading(false);
  }, [accessLevel, isReady, username]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const groups = useMemo(() => {
    const grouped = new Map<string, TeamDocument[]>();
    documents.forEach((document) => {
      grouped.set(document.owner_username, [
        ...(grouped.get(document.owner_username) ?? []),
        document,
      ]);
    });
    return Array.from(grouped.entries());
  }, [documents]);

  async function saveDocument() {
    if (
      accessLevel !== "owner" ||
      !editor ||
      !editor.ownerUsername ||
      !editor.documentName.trim() ||
      (!editor.record && !editor.file) ||
      isSaving
    ) {
      return;
    }

    setIsSaving(true);
    setError(null);
    let uploadedPath: string | null = null;
    try {
      let fileUrl = editor.record?.file_url ?? "";
      if (editor.file) {
        const isPdf =
          editor.file.type === "application/pdf" ||
          editor.file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) throw new Error("Team documents must be PDF files.");
        uploadedPath = `${editor.ownerUsername}/${crypto.randomUUID()}-${editor.file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(uploadedPath, editor.file, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (uploadError) throw uploadError;
        fileUrl = supabase.storage.from(BUCKET).getPublicUrl(uploadedPath)
          .data.publicUrl;
      }

      const payload = {
        owner_username: editor.ownerUsername,
        file_url: fileUrl,
        document_name: editor.documentName.trim(),
        category: editor.category.trim() || null,
      };
      const { error: mutationError } = editor.record
        ? await supabase
            .from("team_documents")
            .update(payload)
            .eq("id", editor.record.id)
        : await supabase.from("team_documents").insert(payload);
      if (mutationError) throw mutationError;

      if (uploadedPath && editor.record?.file_url) {
        const oldPath = storagePath(editor.record.file_url);
        if (oldPath) {
          await supabase.storage.from(BUCKET).remove([oldPath]);
        }
      }
      setEditor(null);
      void loadDocuments();
    } catch (caught) {
      if (uploadedPath) {
        await supabase.storage.from(BUCKET).remove([uploadedPath]);
      }
      setError(
        caught instanceof Error ? caught.message : "Could not save document.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteDocument(document: TeamDocument) {
    if (accessLevel !== "owner") return;
    if (deleteId !== document.id) {
      setDeleteId(document.id);
      return;
    }
    const { error: mutationError } = await supabase
      .from("team_documents")
      .delete()
      .eq("id", document.id);
    if (mutationError) {
      setError(mutationError.message);
      return;
    }
    const path = storagePath(document.file_url);
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    setDeleteId(null);
    void loadDocuments();
  }

  return (
    <main className="px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <section className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7D4698]">
              Team Hub · Files
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#28154F] sm:text-4xl">
              Documents
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#75647F] sm:text-base">
              {accessLevel === "owner"
                ? "Manage private team documents across every staff member."
                : `${name ?? "Your"} documents are available here to view and download.`}
            </p>
          </div>
          {accessLevel === "owner" && (
            <TeamButton
              onClick={() =>
                setEditor({
                  ownerUsername: "Understory_Arion",
                  documentName: "",
                  category: "",
                  file: null,
                })
              }
            >
              + Add document
            </TeamButton>
          )}
        </section>

        {error && (
          <div
            role="alert"
            className="mt-7 rounded-2xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
          >
            {error}
          </div>
        )}

        <section className="mt-9 space-y-6">
          {isLoading ? (
            <div className="h-52 animate-pulse rounded-[24px] border border-[#D7CBE0] bg-white" />
          ) : groups.length ? (
            groups.map(([ownerUsername, rows]) => {
              const profile = profileByUsername[ownerUsername];
              return (
                <article
                  key={ownerUsername}
                  className="overflow-hidden rounded-[24px] border border-[#D7CBE0] bg-white shadow-[0_8px_28px_rgba(40,21,79,0.055)]"
                >
                  <header className="border-b border-[#E5DBEA] bg-[#FFFDF8] px-5 py-5 sm:px-6">
                    <p className="text-lg font-semibold text-[#341F60]">
                      {profile?.name ?? ownerUsername}
                    </p>
                    <p className="mt-1 text-xs text-[#75647F]">
                      {profile?.title ?? ownerUsername} · {rows.length} document
                      {rows.length === 1 ? "" : "s"}
                    </p>
                  </header>
                  <div className="divide-y divide-[#E9E0EF]">
                    {rows.map((document) => (
                      <div
                        key={document.id}
                        className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:px-6"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EEE3FA] text-xs font-bold text-[#7D4698]">
                            {document.file_url.startsWith("/") ? "INV" : "PDF"}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#341F60]">
                              {document.document_name}
                            </p>
                            <p className="mt-1 text-[11px] text-[#8B7895]">
                              {document.category || "Uncategorized"} ·{" "}
                              {new Date(document.created_at).toLocaleDateString(
                                "en-CA",
                              )}
                            </p>
                          </div>
                        </div>
                        <a
                          href={document.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="w-fit rounded-full border border-[#CDBAD9] px-3.5 py-2 text-xs font-semibold text-[#7D4698] hover:bg-[#EEE3FA]"
                        >
                          {document.file_url.startsWith("/")
                            ? "View invoice ↗"
                            : "View / download ↗"}
                        </a>
                        {accessLevel === "owner" && (
                          <div className="flex gap-2">
                            <TeamButton
                              tone="secondary"
                              onClick={() =>
                                setEditor({
                                  record: document,
                                  ownerUsername: document.owner_username,
                                  documentName: document.document_name,
                                  category: document.category ?? "",
                                  file: null,
                                })
                              }
                            >
                              Edit
                            </TeamButton>
                            <TeamButton
                              tone="danger"
                              onClick={() => void deleteDocument(document)}
                            >
                              {deleteId === document.id
                                ? "Confirm delete?"
                                : "Delete"}
                            </TeamButton>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-[24px] border border-dashed border-[#CDBAD9] bg-white px-6 py-14 text-center">
              <p className="text-sm font-semibold text-[#5F4D70]">
                No team documents yet.
              </p>
              <p className="mt-1 text-xs text-[#8B7895]">
                {accessLevel === "owner"
                  ? "Upload the first PDF for a team member."
                  : "Documents assigned to you will appear here."}
              </p>
            </div>
          )}
        </section>
      </div>

      <TeamModal
        open={Boolean(editor)}
        title={`${editor?.record ? "Edit" : "Add"} team document`}
        description="Owners can assign PDFs to any team member."
        submitLabel={editor?.record ? "Save changes" : "Add document"}
        isSaving={isSaving}
        submitDisabled={
          !editor?.ownerUsername ||
          !editor.documentName.trim() ||
          (!editor.record && !editor.file)
        }
        onClose={() => setEditor(null)}
        onSubmit={(event) => {
          event.preventDefault();
          void saveDocument();
        }}
      >
        {editor && (
          <div className="space-y-4">
            <label className="block text-xs font-semibold text-[#341F60]">
              Belongs to
              <select
                value={editor.ownerUsername}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    ownerUsername: event.target.value,
                  })
                }
                className={`mt-2 ${teamInputClass}`}
              >
                {profiles.map((profile) => (
                  <option key={profile.username} value={profile.username}>
                    {profile.name} · {profile.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-[#341F60]">
              Document name
              <input
                value={editor.documentName}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    documentName: event.target.value,
                  })
                }
                className={`mt-2 ${teamInputClass}`}
              />
            </label>
            <label className="block text-xs font-semibold text-[#341F60]">
              Category
              <input
                value={editor.category}
                onChange={(event) =>
                  setEditor({ ...editor, category: event.target.value })
                }
                placeholder="Contract, tax form, policy…"
                className={`mt-2 ${teamInputClass}`}
              />
            </label>
            <label className="block text-xs font-semibold text-[#341F60]">
              PDF file
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    file: event.target.files?.[0] ?? null,
                  })
                }
                className={`mt-2 ${teamInputClass}`}
              />
              {editor.record && !editor.file && (
                <span className="mt-2 block text-[11px] text-[#75647F]">
                  Leave this empty to keep the current PDF.
                </span>
              )}
            </label>
          </div>
        )}
      </TeamModal>
    </main>
  );
}
