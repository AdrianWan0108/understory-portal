"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { TEAM_IDENTITIES } from "@/lib/team-auth";
import { supabase } from "@/lib/supabase";
import { TeamModal } from "../../_components/TeamHubUi";

export type TaskTeamMember = {
  team_username: string;
  full_name: string;
  avatar_url: string | null;
};

const fallbackMembers: TaskTeamMember[] = Object.values(TEAM_IDENTITIES).map(
  (member) => ({
    team_username: member.username,
    full_name: member.name,
    avatar_url: null,
  }),
);

export function useTaskTeamMembers() {
  const [members, setMembers] = useState<TaskTeamMember[]>(fallbackMembers);

  useEffect(() => {
    let isActive = true;

    async function loadMembers() {
      const { data, error } = await supabase
        .from("team_profile_directory")
        .select("team_username, full_name, avatar_url")
        .order("full_name", { ascending: true });

      if (isActive && !error && data?.length) {
        setMembers(data as TaskTeamMember[]);
      }
    }

    void loadMembers();
    return () => {
      isActive = false;
    };
  }, []);

  return members;
}

function MemberAvatar({ member }: { member: TaskTeamMember }) {
  return member.avatar_url ? (
    <Image
      src={member.avatar_url}
      alt=""
      width={36}
      height={36}
      className="size-9 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#7D4698] text-xs font-bold text-white"
    >
      {member.full_name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function TaskPeopleButton({
  taskTitle,
  assigneeUsernames,
  members,
  disabled = false,
  onClick,
}: {
  taskTitle: string;
  assigneeUsernames: string[];
  members: TaskTeamMember[];
  disabled?: boolean;
  onClick: () => void;
}) {
  const assignedMembers = assigneeUsernames
    .map((username) =>
      members.find((member) => member.team_username === username),
    )
    .filter((member): member is TaskTeamMember => Boolean(member));
  const label = assigneeUsernames.length
    ? `${assigneeUsernames.length} ${
        assigneeUsernames.length === 1 ? "person" : "people"
      }`
    : "Assign people";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`${label} on ${taskTitle}`}
      className="inline-flex min-w-0 items-center gap-2 rounded-full border border-[#DED0E7] bg-white px-3 py-2 text-[11px] font-semibold text-[#695677] transition hover:border-[#C7B3D2] hover:bg-[#F5EEFA] disabled:cursor-default disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7D4698]"
    >
      {assignedMembers.length ? (
        <span className="flex -space-x-1.5" aria-hidden="true">
          {assignedMembers.slice(0, 3).map((member) => (
            member.avatar_url ? (
              <Image
                key={member.team_username}
                src={member.avatar_url}
                alt=""
                title={member.full_name}
                width={20}
                height={20}
                className="size-5 rounded-full border border-white object-cover"
              />
            ) : (
              <span
                key={member.team_username}
                title={member.full_name}
                className="flex size-5 items-center justify-center rounded-full border border-white bg-[#7D4698] text-[8px] font-bold text-white"
              >
                {member.full_name.trim().charAt(0).toUpperCase()}
              </span>
            )
          ))}
        </span>
      ) : (
        <span aria-hidden="true" className="text-sm leading-none">
          +
        </span>
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function TaskPeopleModal({
  open,
  taskTitle,
  members,
  selectedUsernames,
  isSaving,
  error,
  onToggle,
  onClose,
  onSave,
}: {
  open: boolean;
  taskTitle: string;
  members: TaskTeamMember[];
  selectedUsernames: string[];
  isSaving: boolean;
  error: string | null;
  onToggle: (username: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <TeamModal
      open={open}
      title="Assign or tag people"
      description={
        taskTitle
          ? `Choose everyone who should be tagged on “${taskTitle}”.`
          : undefined
      }
      submitLabel="Save people"
      isSaving={isSaving}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="grid gap-3">
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
          >
            {error}
          </p>
        )}
        {members.map((member) => {
          const isSelected = selectedUsernames.includes(member.team_username);
          return (
            <label
              key={member.team_username}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 transition ${
                isSelected
                  ? "border-[#7D4698] bg-[#EEE3FA]"
                  : "border-[#E3D8EA] bg-white hover:border-[#C7B3D2]"
              }`}
            >
              <MemberAvatar member={member} />
              <span className="min-w-0 flex-1 text-sm font-semibold text-[#341F60]">
                {member.full_name}
              </span>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(member.team_username)}
                className="size-4 accent-[#7D4698]"
              />
            </label>
          );
        })}
        <p className="text-xs leading-5 text-[#75647F]">
          Leave everyone unchecked to keep this task unassigned.
        </p>
      </div>
    </TeamModal>
  );
}
