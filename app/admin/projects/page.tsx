"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  DIVISION_LABELS,
  DIVISIONS,
  DIVISION_TASK_STATUSES,
  DIVISION_TASK_STATUS_DETAILS,
  type Division,
  type DivisionTaskStatus,
} from "@/lib/division-tasks";
import { supabase } from "@/lib/supabase";
import { useAdmin } from "../_components/AdminContext";
import {
  AdminButton,
  AdminConfirmDialog,
  AdminEmpty,
  AdminMessage,
  AdminModal,
  AdminPageHeader,
  inputClass,
} from "../_components/AdminUi";

type Project = {
  id: string;
  division: Division;
  title: string;
  description: string | null;
  status: DivisionTaskStatus;
  template_type: string;
  created_at: string;
  division_task_items: Array<{ id: string }> | null;
};

type Editor = {
  id?: string;
  division: Division;
  title: string;
  description: string;
  status: DivisionTaskStatus;
};

export default function AdminProjectsPage() {
  const { clientId, clientName } = useAdmin();
  const [projects, setProjects] = useState<Project[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    const { data, error: loadError } = await supabase
      .from("division_tasks")
      .select(
        "id, division, title, description, status, template_type, created_at, division_task_items(id)",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (loadError) {
      setError(loadError.message);
      setProjects([]);
    } else {
      setProjects(
        ((data ?? []) as unknown as Project[]).filter(
          (project) => project.template_type !== "internal_approval",
        ),
      );
      setError(null);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProject() {
    if (!clientId || !editor || !editor.title.trim() || isSaving) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    const payload = {
      division: editor.division,
      title: editor.title.trim(),
      description: editor.description.trim() || null,
      status: editor.status,
    };
    const mutation = editor.id
      ? supabase.from("division_tasks").update(payload).eq("id", editor.id)
      : supabase.from("division_tasks").insert({
          client_id: clientId,
          template_type: "generic",
          ...payload,
        });
    const { error: mutationError } = await mutation;
    setIsSaving(false);
    if (mutationError) {
      setError(mutationError.message);
      return;
    }
    setSuccess(
      editor.id
        ? "Project updated in Team Hub and the client portal."
        : "Project added to Team Hub and the client portal.",
    );
    setEditor(null);
    void load();
  }

  async function updateStatus(project: Project, status: DivisionTaskStatus) {
    const { error: mutationError } = await supabase
      .from("division_tasks")
      .update({ status })
      .eq("id", project.id)
      .eq("client_id", clientId);
    if (mutationError) {
      setError(mutationError.message);
      return;
    }
    setSuccess(`${project.title} is now ${DIVISION_TASK_STATUS_DETAILS[status].label.toLowerCase()}.`);
    void load();
  }

  async function deleteProject() {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    const { error: mutationError } = await supabase
      .from("division_tasks")
      .delete()
      .eq("id", deleteTarget.id)
      .eq("client_id", clientId);
    setIsDeleting(false);
    if (mutationError) {
      setError(mutationError.message);
      return;
    }
    setSuccess("Project removed from Team Hub and the client portal.");
    setDeleteTarget(null);
    void load();
  }

  return (
    <main className="px-5 py-10 sm:px-8 lg:px-10">
      <AdminPageHeader
        title="Projects"
        description={`Live Team Hub projects that power ${clientName ?? "this client"}’s portal progress page.`}
        action={
          <AdminButton
            onClick={() =>
              setEditor({
                division: "social-media",
                title: "",
                description: "",
                status: "planning",
              })
            }
          >
            + Add project
          </AdminButton>
        }
      />
      <AdminMessage error={error} success={success} />

      <div className="mt-7 grid gap-5">
        {DIVISIONS.map((division) => {
          const divisionProjects = projects.filter(
            (project) => project.division === division,
          );
          return (
            <section
              key={division}
              className="overflow-hidden rounded-[22px] border border-[#D7CBE0] bg-white"
            >
              <div className="flex items-center justify-between border-b border-[#E4D9EA] bg-[#F8F3FB] px-5 py-4">
                <h2 className="text-base font-semibold text-[#341F60]">
                  {DIVISION_LABELS[division]}
                </h2>
                <span className="rounded-full bg-[#EEE3FA] px-3 py-1 text-[10px] font-semibold text-[#5F3378]">
                  {divisionProjects.length} projects
                </span>
              </div>

              {divisionProjects.length > 0 ? (
                <div className="divide-y divide-[#E4D9EA]">
                  {divisionProjects.map((project) => (
                    <article
                      key={project.id}
                      className="flex flex-col gap-4 px-5 py-5 xl:flex-row xl:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-[#341F60]">
                          {project.title}
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-[#75647F]">
                          {project.description || "No description"}
                        </p>
                        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8B7895]">
                          {project.division_task_items?.length ?? 0} items · {project.template_type.replaceAll("_", " ")}
                        </p>
                      </div>

                      <select
                        value={project.status}
                        aria-label={`Status for ${project.title}`}
                        onChange={(event) =>
                          void updateStatus(
                            project,
                            event.target.value as DivisionTaskStatus,
                          )
                        }
                        className="rounded-xl border border-[#CDBAD9] bg-[#EEE3FA] px-3 py-2 text-xs font-semibold text-[#5F3378]"
                      >
                        {DIVISION_TASK_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {DIVISION_TASK_STATUS_DETAILS[status].label}
                          </option>
                        ))}
                      </select>

                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/team-hub/projects/${project.id}`}
                          className="rounded-full bg-[#341F60] px-4 py-2.5 text-xs font-semibold text-white"
                        >
                          Open workspace ↗
                        </Link>
                        <AdminButton
                          tone="secondary"
                          onClick={() =>
                            setEditor({
                              id: project.id,
                              division: project.division,
                              title: project.title,
                              description: project.description ?? "",
                              status: project.status,
                            })
                          }
                        >
                          Edit
                        </AdminButton>
                        <AdminButton
                          tone="danger"
                          onClick={() => setDeleteTarget(project)}
                        >
                          Delete
                        </AdminButton>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <AdminEmpty>No Open Projects</AdminEmpty>
              )}
            </section>
          );
        })}
      </div>

      <AdminModal
        open={Boolean(editor)}
        title={editor?.id ? "Edit live project" : "Add live project"}
        description="Changes here use the same project record shown in Team Hub and summarized in the client portal."
        submitLabel={editor?.id ? "Save changes" : "Add project"}
        isSaving={isSaving}
        submitDisabled={!editor?.title.trim()}
        onClose={() => setEditor(null)}
        onSubmit={(event) => {
          event.preventDefault();
          void saveProject();
        }}
      >
        {editor && (
          <div className="grid gap-4">
            <label className="text-xs font-semibold text-[#341F60]">
              Category
              <select
                value={editor.division}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    division: event.target.value as Division,
                  })
                }
                className={`mt-2 ${inputClass}`}
              >
                {DIVISIONS.map((division) => (
                  <option key={division} value={division}>
                    {DIVISION_LABELS[division]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-[#341F60]">
              Project name
              <input
                autoFocus
                value={editor.title}
                onChange={(event) =>
                  setEditor({ ...editor, title: event.target.value })
                }
                className={`mt-2 ${inputClass}`}
              />
            </label>
            <label className="text-xs font-semibold text-[#341F60]">
              Status
              <select
                value={editor.status}
                onChange={(event) =>
                  setEditor({
                    ...editor,
                    status: event.target.value as DivisionTaskStatus,
                  })
                }
                className={`mt-2 ${inputClass}`}
              >
                {DIVISION_TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {DIVISION_TASK_STATUS_DETAILS[status].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-[#341F60]">
              Description
              <textarea
                rows={4}
                value={editor.description}
                onChange={(event) =>
                  setEditor({ ...editor, description: event.target.value })
                }
                className={`mt-2 resize-y ${inputClass}`}
              />
            </label>
          </div>
        )}
      </AdminModal>

      <AdminConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete live project?"
        description={`This removes “${deleteTarget?.title ?? "this project"}” and its items from Team Hub and the client portal.`}
        isWorking={isDeleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteProject()}
      />
    </main>
  );
}
