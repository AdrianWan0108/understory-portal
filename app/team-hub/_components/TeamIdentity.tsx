"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getTeamIdentityForUsername,
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
  type TeamAccessLevel,
  type TeamIdentity,
} from "@/lib/team-auth";
import { supabase } from "@/lib/supabase";

export {
  TEAM_IDENTITIES,
  TEAM_MEMBER_PROFILES,
  VALID_TEAM_USERNAMES,
  type TeamAccessLevel,
  type TeamIdentity,
} from "@/lib/team-auth";

export const TEAM_IDENTITY_SESSION_KEY = "understory-team-hub-identity";
export const TEAM_NAME_SESSION_KEY = "understory-team-hub-name";
export const TEAM_TITLE_SESSION_KEY = "understory-team-hub-title";
export const TEAM_ACCESS_SESSION_KEY = "understory-team-hub-access-level";

type TeamIdentityContextValue = {
  identity: TeamIdentity | null;
  username: string | null;
  name: string | null;
  title: string | null;
  accessLevel: TeamAccessLevel | null;
  avatarUrl: string | null;
  displayName: string | null;
  isReady: boolean;
  isPickerOpen: boolean;
  selectIdentity: (identity: TeamIdentity) => void;
  openIdentityPicker: () => void;
};

const TeamIdentityContext =
  createContext<TeamIdentityContextValue | null>(null);

function clearSession() {
  window.sessionStorage.removeItem(TEAM_IDENTITY_SESSION_KEY);
  window.sessionStorage.removeItem(TEAM_NAME_SESSION_KEY);
  window.sessionStorage.removeItem(TEAM_TITLE_SESSION_KEY);
  window.sessionStorage.removeItem(TEAM_ACCESS_SESSION_KEY);
  document.cookie = `${TEAM_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function readCookie(name: string) {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));

  if (!cookie) return null;

  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch {
    return null;
  }
}

export function saveTeamSession(identity: TeamIdentity) {
  const profile = TEAM_IDENTITIES[identity];
  const secure = window.location.protocol === "https:" ? "; Secure" : "";

  window.sessionStorage.setItem(TEAM_IDENTITY_SESSION_KEY, identity);
  window.sessionStorage.setItem(TEAM_NAME_SESSION_KEY, profile.name);
  window.sessionStorage.setItem(TEAM_TITLE_SESSION_KEY, profile.title);
  window.sessionStorage.setItem(
    TEAM_ACCESS_SESSION_KEY,
    profile.accessLevel,
  );
  document.cookie = `${TEAM_SESSION_COOKIE}=${encodeURIComponent(
    profile.username,
  )}; Path=/; SameSite=Lax${secure}`;
}

export function readTeamSessionProfile() {
  if (typeof window === "undefined") return null;
  const savedIdentity = window.sessionStorage.getItem(
    TEAM_IDENTITY_SESSION_KEY,
  ) as TeamIdentity | null;
  const savedProfile = savedIdentity ? TEAM_IDENTITIES[savedIdentity] : null;
  const hasValidSavedProfile = Boolean(
    savedProfile &&
      savedProfile.name ===
        window.sessionStorage.getItem(TEAM_NAME_SESSION_KEY) &&
      savedProfile.title ===
        window.sessionStorage.getItem(TEAM_TITLE_SESSION_KEY) &&
      savedProfile.accessLevel ===
        window.sessionStorage.getItem(TEAM_ACCESS_SESSION_KEY),
  );
  const cookieIdentity = getTeamIdentityForUsername(
    readCookie(TEAM_SESSION_COOKIE),
  );

  if (
    hasValidSavedProfile &&
    savedIdentity &&
    savedProfile &&
    cookieIdentity === savedIdentity
  ) {
    return { identity: savedIdentity, ...savedProfile };
  }

  if (cookieIdentity) {
    saveTeamSession(cookieIdentity);
    return { identity: cookieIdentity, ...TEAM_IDENTITIES[cookieIdentity] };
  }

  clearSession();
  return null;
}

export function TeamIdentityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [identity, setIdentity] = useState<TeamIdentity | null>(null);
  const [syncedProfile, setSyncedProfile] = useState<{
    identity: TeamIdentity;
    avatarUrl: string | null;
    displayName: string | null;
  } | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedProfile = readTeamSessionProfile();

      if (savedProfile) {
        setIdentity(savedProfile.identity);
      } else {
        clearSession();
      }
      setIsReady(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!identity) return;
    let isActive = true;
    const activeIdentity = identity;

    async function loadSyncedProfile() {
      const { data, error } = await supabase
        .from("team_profile_directory")
        .select("avatar_url, slack_display_name")
        .eq("team_username", TEAM_IDENTITIES[activeIdentity].username)
        .maybeSingle();

      if (!isActive) return;
      if (error) {
        console.warn("Could not load the synced team profile", error.message);
        return;
      }

      setSyncedProfile({
        identity: activeIdentity,
        avatarUrl: data?.avatar_url ?? null,
        displayName: data?.slack_display_name ?? null,
      });
    }

    void loadSyncedProfile();
    return () => {
      isActive = false;
    };
  }, [identity]);

  const value = useMemo<TeamIdentityContextValue>(() => {
    const profile = identity ? TEAM_IDENTITIES[identity] : null;
    const activeSyncedProfile =
      identity && syncedProfile?.identity === identity
        ? syncedProfile
        : null;

    return {
      identity,
      username: profile?.username ?? null,
      name: profile?.name ?? null,
      title: profile?.title ?? null,
      accessLevel: profile?.accessLevel ?? null,
      avatarUrl: activeSyncedProfile?.avatarUrl ?? null,
      displayName: activeSyncedProfile?.displayName ?? null,
      isReady,
      isPickerOpen,
      selectIdentity: (nextIdentity) => {
        saveTeamSession(nextIdentity);
        setIdentity(nextIdentity);
        setIsPickerOpen(false);
      },
      openIdentityPicker: () => {
        clearSession();
        setIdentity(null);
        setIsPickerOpen(true);
      },
    };
  }, [identity, isPickerOpen, isReady, syncedProfile]);

  return (
    <TeamIdentityContext.Provider value={value}>
      {children}
    </TeamIdentityContext.Provider>
  );
}

export function useTeamIdentity() {
  const context = useContext(TeamIdentityContext);

  if (!context) {
    throw new Error(
      "useTeamIdentity must be used within TeamIdentityProvider.",
    );
  }

  return context;
}
