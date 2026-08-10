"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { TEAM_IDENTITIES } from "@/lib/team-auth";
import { teamNameForUsername } from "@/lib/team-assignments";
import {
  DIVISIONS,
  DIVISION_LABELS,
  DIVISION_TASK_STATUSES,
  DIVISION_TASK_STATUS_DETAILS,
  isDivisionTaskStatus,
  normalizeContentBriefData,
  type Division,
  type DivisionTaskStatus,
} from "@/lib/division-tasks";
import {
  WORKSPACE_CLIENT_SLUGS,
  WORKSPACE_CLIENTS,
  isWorkspaceClientSlug,
} from "@/lib/workspace-clients";

type TimelineTask = {
  id: string;
  title: string;
  division: Division;
  status: DivisionTaskStatus;
  href: string;
  dueDate: string | null;
  assigneeInitials: string[];
};

type ClientGroup = {
  clientId: string;
  clientName: string;
  clientSlug: string;
  tasksByDivision: Map<Division, TimelineTask[]>;
};

function initialsForUsername(username: string) {
  const normalized = username.trim().toLocaleLowerCase();
  const identity = Object.values(TEAM_IDENTITIES).find(
    (member) => member.username.toLocaleLowerCase() === normalized,
  );
  if (identity) return identity.initials;
  return teamNameForUsername(username)?.slice(0, 1).toUpperCase() ?? "?";
}

function taskHref(taskId: string, division: Division, clientSlug: string) {
  if (division === "website" && isWorkspaceClientSlug(clientSlug)) {
    return `/team-hub/projects/website?client=${clientSlug}&task=${encodeURIComponent(taskId)}`;
  }
  return `/team-hub/projects/${encodeURIComponent(taskId)}`;
}

function formatDueDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function StatusSummaryBar({ tasks }: { tasks: TimelineTask[] }) {
  const total = tasks.length;
  if (!total) return null;

  const counts = new Map<DivisionTaskStatus, number>();
  for (const task of tasks) {
    counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
  }

  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full border border-[#D7CBE0] bg-[#F5F2F6]">
        {DIVISION_TASK_STATUSES.map((status) => {
          const count = counts.get(status) ?? 0;
          if (!count) return null;
          return (
            <div
              key={status}
              style={{ flexGrow: count, flexBasis: 0 }}
              className={`${DIVISION_TASK_STATUS_DETAILS[status].dot} rounded-full`}
              title={`${DIVISION_TASK_STATUS_DETAILS[status].label}: ${count}`}
            />
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {DIVISION_TASK_STATUSES.map((status) => (
          <div key={status} className="flex items-center gap-1.5 text-xs text-[#5F5566]">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${DIVISION_TASK_STATUS_DETAILS[status].dot}`}
            />
            <span className="font-medium text-[#341F60]">
              {DIVISION_TASK_STATUS_DETAILS[status].label}
            </span>
            <span>{counts.get(status) ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskChip({ task }: { task: TimelineTask }) {
  const dueLabel = task.dueDate ? formatDueDate(task.dueDate) : null;
  return (
    <Link
      href={task.href}
      className="block rounded-xl border border-[#E7DDEA] bg-[#FFFDF8] px-2.5 py-2 text-left shadow-[0_3px_10px_rgba(40,21,79,0.04)] transition hover:-translate-y-0.5 hover:border-[#C7B4D3] hover:shadow-[0_8px_18px_rgba(40,21,79,0.08)]"
    >
      <p className="line-clamp-2 text-[11.5px] font-medium leading-4 text-[#341F60]">
        {task.title}
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex -space-x-1.5">
          {task.assigneeInitials.length ? (
            task.assigneeInitials.map((initials, index) => (
              <span
                key={`${initials}-${index}`}
                className="flex size-5 items-center justify-center rounded-full border border-white bg-[#E9E0EF] text-[9px] font-bold text-[#5F3378]"
              >
                {initials}
              </span>
            ))
          ) : (
            <span className="text-[10px] text-[#AA98B4]">Unassigned</span>
          )}
        </div>
        {dueLabel && (
          <span className="whitespace-nowrap text-[10px] font-semibold text-[#8B7895]">
            Due {dueLabel}
          </span>
        )}
      </div>
    </Link>
  );
}

function StatusColumn({
  status,
  tasks,
}: {
  status: DivisionTaskStatus;
  tasks: TimelineTask[];
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 pb-2">
        <span
          aria-hidden="true"
          className={`size-1.5 rounded-full ${DIVISION_TASK_STATUS_DETAILS[status].dot}`}
        />
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#8B7895]">
          {DIVISION_TASK_STATUS_DETAILS[status].label} · {tasks.length}
        </p>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskChip key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

export function ProjectTimelineBoard() {
  const [tasks, setTasks] = useState<TimelineTask[] | null>(null);
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function load() {
      const [clientsResult, tasksResult] = await Promise.all([
        supabase.from("clients").select("id, name, slug"),
        supabase
          .from("division_tasks")
          .select(
            "id, client_id, division, title, status, template_type, content_brief_data, assignee_usernames, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      if (!isActive) return;

      if (clientsResult.error || tasksResult.error) {
        setError(
          clientsResult.error?.message ??
            tasksResult.error?.message ??
            "Could not load the project timeline.",
        );
        return;
      }

      const clients = clientsResult.data ?? [];
      const clientsById = new Map(clients.map((client) => [client.id, client]));
      const clientOrder = new Map<string, number>(
        WORKSPACE_CLIENT_SLUGS.map((slug, index) => [slug, index]),
      );

      const groupsByClientId = new Map<string, ClientGroup>();
      const flatTasks: TimelineTask[] = [];

      for (const row of tasksResult.data ?? []) {
        if (!DIVISIONS.includes(row.division as Division)) continue;
        if (!isDivisionTaskStatus(row.status)) continue;

        const client = clientsById.get(row.client_id);
        if (!client) continue;

        const division = row.division as Division;
        const dueDate =
          row.template_type === "content_brief"
            ? normalizeContentBriefData(row.content_brief_data).due_date ||
              null
            : null;

        const timelineTask: TimelineTask = {
          id: row.id,
          title: row.title,
          division,
          status: row.status,
          href: taskHref(row.id, division, client.slug),
          dueDate,
          assigneeInitials: (row.assignee_usernames ?? []).map(
            initialsForUsername,
          ),
        };

        flatTasks.push(timelineTask);

        let group = groupsByClientId.get(client.id);
        if (!group) {
          group = {
            clientId: client.id,
            clientName: client.name,
            clientSlug: client.slug,
            tasksByDivision: new Map(),
          };
          groupsByClientId.set(client.id, group);
        }
        const divisionTasks = group.tasksByDivision.get(division) ?? [];
        divisionTasks.push(timelineTask);
        group.tasksByDivision.set(division, divisionTasks);
      }

      const sortedGroups = Array.from(groupsByClientId.values()).sort(
        (first, second) => {
          const firstOrder = clientOrder.get(first.clientSlug) ?? 999;
          const secondOrder = clientOrder.get(second.clientSlug) ?? 999;
          return firstOrder - secondOrder;
        },
      );

      setTasks(flatTasks);
      setClientGroups(sortedGroups);
    }

    void load();
    return () => {
      isActive = false;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl border border-[#E4B9B9] bg-[#FFF0F0] px-5 py-6 text-sm text-[#8B3E3E]">
        {error}
      </div>
    );
  }

  if (tasks === null) {
    return (
      <div className="space-y-3">
        <div className="h-3 w-full animate-pulse rounded-full bg-[#F1EAF5]" />
        <div className="h-40 animate-pulse rounded-2xl bg-[#F1EAF5]" />
      </div>
    );
  }

  if (!tasks.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[#D7CBE0] bg-[#FFFDF8] px-5 py-8 text-center text-sm leading-6 text-[#75647F]">
        No projects yet. Once client work is added across the portal,
        it&rsquo;ll show up here as a live pipeline for everyone on the team.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <StatusSummaryBar tasks={tasks} />
      <div className="space-y-6">
        {clientGroups.map((group) => (
          <section
            key={group.clientId}
            className="overflow-hidden rounded-[20px] border border-[#E7DDEA] bg-[#FFFDF8]"
          >
            <header className="border-b border-[#E7DDEA] bg-white px-4 py-3 sm:px-5">
              <Link
                href={
                  isWorkspaceClientSlug(group.clientSlug)
                    ? `/team-hub/projects/${group.clientSlug}`
                    : "/team-hub/projects"
                }
                className="text-sm font-semibold text-[#341F60] hover:text-[#7D4698]"
              >
                {WORKSPACE_CLIENTS[
                  group.clientSlug as keyof typeof WORKSPACE_CLIENTS
                ]?.name ?? group.clientName}
              </Link>
            </header>
            <div className="divide-y divide-[#EFE7F2] px-4 py-1 sm:px-5">
              {DIVISIONS.filter((division) =>
                group.tasksByDivision.has(division),
              ).map((division) => {
                const divisionTasks = group.tasksByDivision.get(division) ?? [];
                return (
                  <div key={division} className="py-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-[#5F3378]">
                      {DIVISION_LABELS[division]}
                    </p>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      {DIVISION_TASK_STATUSES.map((status) => (
                        <StatusColumn
                          key={status}
                          status={status}
                          tasks={divisionTasks.filter(
                            (task) => task.status === status,
                          )}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
