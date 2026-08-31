"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useTeamIdentity } from "../_components/TeamIdentity";
import {
  ProfileEditForm,
  type ProfileEditValues,
  type ProfileSaveResult,
} from "../_components/ProfileEditForm";
import { TeamButton } from "../_components/TeamHubUi";
import { PrivateProfileCard } from "../_components/PrivateProfileCard";

type ProfileRow = {
  team_username: string;
  full_name: string;
  email: string | null;
  title: string | null;
};

function toFormValues(row: ProfileRow): ProfileEditValues {
  return {
    full_name: row.full_name ?? "",
    email: row.email ?? "",
    title: row.title ?? "",
  };
}

async function saveProfile(
  values: ProfileEditValues,
  targetUsername?: string,
): Promise<ProfileSaveResult> {
  try {
    const response = await fetch("/api/team-hub/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        ...(targetUsername ? { team_username: targetUsername } : {}),
      }),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        error: body.error ?? "Could not save the profile.",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}

function LoadingBlock({ className = "h-40" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-2xl bg-[#EEE3FA] ${className}`} />
  );
}

export default function TeamHubProfilePage() {
  const { accessLevel, isReady, avatarUrl, displayName, name } =
    useTeamIdentity();
  const isOwner = accessLevel === "owner";

  const [ownProfile, setOwnProfile] = useState<ProfileRow | null>(null);
  const [isLoadingOwn, setIsLoadingOwn] = useState(true);
  const [ownLoadError, setOwnLoadError] = useState<string | null>(null);

  const [directory, setDirectory] = useState<ProfileRow[] | null>(null);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<ProfileRow | null>(
    null,
  );

  useEffect(() => {
    if (!isReady) return;
    let isActive = true;

    async function loadOwnProfile() {
      setIsLoadingOwn(true);
      setOwnLoadError(null);
      try {
        const response = await fetch("/api/team-hub/profile");
        const body = await response.json().catch(() => ({}));
        if (!isActive) return;
        if (!response.ok) {
          setOwnLoadError(body.error ?? "Could not load your profile.");
          return;
        }
        setOwnProfile(body.profile as ProfileRow);
      } catch {
        if (isActive) setOwnLoadError("Could not reach the server.");
      } finally {
        if (isActive) setIsLoadingOwn(false);
      }
    }

    void loadOwnProfile();
    return () => {
      isActive = false;
    };
  }, [isReady]);

  useEffect(() => {
    if (!isReady || !isOwner) return;
    let isActive = true;

    async function loadDirectory() {
      setIsLoadingDirectory(true);
      setDirectoryError(null);
      try {
        const response = await fetch("/api/team-hub/profile?all=1");
        const body = await response.json().catch(() => ({}));
        if (!isActive) return;
        if (!response.ok) {
          setDirectoryError(
            body.error ?? "Could not load the team directory.",
          );
          return;
        }
        setDirectory(body.profiles as ProfileRow[]);
      } catch {
        if (isActive) setDirectoryError("Could not reach the server.");
      } finally {
        if (isActive) setIsLoadingDirectory(false);
      }
    }

    void loadDirectory();
    return () => {
      isActive = false;
    };
  }, [isReady, isOwner]);

  function applyUpdatedRow(
    updated: ProfileEditValues,
    targetUsername: string,
  ) {
    setDirectory(
      (current) =>
        current?.map((row) =>
          row.team_username === targetUsername
            ? { ...row, ...updated }
            : row,
        ) ?? current,
    );
    if (ownProfile?.team_username === targetUsername) {
      setOwnProfile((current) =>
        current ? { ...current, ...updated } : current,
      );
    }
  }

  if (!isReady) {
    return (
      <main className="px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-3xl">
          <LoadingBlock className="h-64" />
        </div>
      </main>
    );
  }

  return (
    <main className="px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
      <div className="mx-auto max-w-3xl">
        <header>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7D4698]">
            Team Hub
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#28154F] sm:text-4xl">
            Profile
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#75647F] sm:text-base">
            Update the details other Understory teammates see for you.
          </p>
        </header>

        <section className="mt-8 rounded-[24px] border border-[#D7CBE0] bg-white p-5 shadow-[0_8px_28px_rgba(40,21,79,0.055)] sm:p-6">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName || name || "Your avatar"}
                width={48}
                height={48}
                className="size-12 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#341F60] text-sm font-semibold text-white">
                {(displayName || name || "?").slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#341F60]">
                {displayName || name}
              </p>
              <p className="text-[11px] text-[#8B7895]">Synced from Slack</p>
            </div>
          </div>

          <div className="mt-6 border-t border-[#E7DDEA] pt-6">
            {isLoadingOwn ? (
              <LoadingBlock />
            ) : ownLoadError ? (
              <p
                role="alert"
                className="rounded-xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
              >
                {ownLoadError}
              </p>
            ) : ownProfile ? (
              <ProfileEditForm
                initialValues={toFormValues(ownProfile)}
                onSave={(values) => saveProfile(values)}
              />
            ) : null}
          </div>
        </section>

        <PrivateProfileCard />

        {isOwner && (
          <section className="mt-8 rounded-[24px] border border-[#D7CBE0] bg-white p-5 shadow-[0_8px_28px_rgba(40,21,79,0.055)] sm:p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7D4698]">
              Owner access
            </p>
            <h2 className="mt-2 text-lg font-semibold text-[#341F60]">
              Team directory
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#75647F]">
              Edit any teammate&apos;s name, email, or title.
            </p>

            <div className="mt-5">
              {isLoadingDirectory ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }, (_, index) => (
                    <LoadingBlock key={index} className="h-16" />
                  ))}
                </div>
              ) : directoryError ? (
                <p
                  role="alert"
                  className="rounded-xl border border-[#E4B9B9] bg-[#FFF0F0] px-4 py-3 text-sm text-[#8B3E3E]"
                >
                  {directoryError}
                </p>
              ) : directory && directory.length > 0 ? (
                <ul className="divide-y divide-[#E7DDEA]">
                  {directory.map((row) => (
                    <li
                      key={row.team_username}
                      className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#341F60]">
                          {row.full_name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-[#8B7895]">
                          {row.title || "No title"} ·{" "}
                          {row.email || "No email"}
                        </p>
                      </div>
                      <TeamButton
                        type="button"
                        tone="secondary"
                        onClick={() => setEditingProfile(row)}
                      >
                        Edit
                      </TeamButton>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#D7CBE0] bg-[#FFFDF8] px-5 py-8 text-center text-sm leading-6 text-[#75647F]">
                  No team profiles found.
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {isOwner && editingProfile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#28154F]/60 px-4 py-8 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close edit profile"
            className="absolute inset-0"
            onClick={() => setEditingProfile(null)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-profile-title"
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-[24px] border border-white/70 bg-[#FFFDF8] shadow-[0_28px_90px_rgba(40,21,79,0.28)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#E2D7E8] px-5 py-5 sm:px-6">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#7D4698]">
                  Owner access
                </p>
                <h2
                  id="edit-profile-title"
                  className="mt-1 text-xl font-semibold text-[#28154F]"
                >
                  Edit {editingProfile.full_name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingProfile(null)}
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#D7CBE0] bg-white text-lg text-[#695677] transition hover:bg-[#EEE3FA]"
              >
                ×<span className="sr-only">Close</span>
              </button>
            </div>
            <div className="px-5 py-5 sm:px-6">
              <ProfileEditForm
                initialValues={toFormValues(editingProfile)}
                onCancel={() => setEditingProfile(null)}
                onSave={async (values) => {
                  const result = await saveProfile(
                    values,
                    editingProfile.team_username,
                  );
                  if (result.ok) {
                    applyUpdatedRow(values, editingProfile.team_username);
                  }
                  return result;
                }}
              />
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
