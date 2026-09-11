"use client";

import { useEffect, useState } from "react";
import { SocialContentCalendarWorkspace } from "@/app/team-hub/projects/[taskId]/calendar/workspace";
import { useProjectTheme } from "@/app/team-hub/projects/_components/ProjectThemeProvider";
import {
  TEAM_GUEST_CLIENT_SLUG,
  TEAM_GUEST_DEFAULT_PATH,
} from "@/lib/team-auth";
import { supabase } from "@/lib/supabase";

type GuestClient = {
  id: string;
  name: string;
  slug: string;
};

type CalendarRow = {
  id: string;
  client_id: string;
};

type SocialCalendar = {
  id: string;
  clientId: string;
  clientName: string;
  clientSlug: string;
};

export function GuestSocialMediaCalendar() {
  const { client, isReady, setClient } = useProjectTheme();
  const [calendar, setCalendar] = useState<SocialCalendar | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadCalendars() {
      setIsLoading(true);
      setError(null);

      const { data: guestClient, error: clientError } = await supabase
        .from("clients")
        .select("id, name, slug")
        .eq("slug", TEAM_GUEST_CLIENT_SLUG)
        .maybeSingle();

      if (!isActive) return;
      if (clientError || !guestClient) {
        setError(
          `Could not load Unknown Dancecrew: ${
            clientError?.message ?? "Client not found."
          }`,
        );
        setIsLoading(false);
        return;
      }

      const allowedClient = guestClient as GuestClient;
      const { data, error: calendarError } = await supabase
        .from("division_tasks")
        .select("id, client_id")
        .eq("client_id", allowedClient.id)
        .eq("division", "social-media")
        .eq("template_type", "content_calendar")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!isActive) return;
      if (calendarError) {
        setError(`Could not load Social Media Calendar: ${calendarError.message}`);
        setIsLoading(false);
        return;
      }

      if (!data) {
        setError("Unknown Dancecrew does not have a Social Media Calendar yet.");
        setIsLoading(false);
        return;
      }

      const calendarRow = data as CalendarRow;
      setCalendar({
        id: calendarRow.id,
        clientId: calendarRow.client_id,
        clientName: allowedClient.name,
        clientSlug: allowedClient.slug,
      });
      setIsLoading(false);
    }

    void loadCalendars();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (isReady && calendar && calendar.clientSlug !== client) {
      setClient(calendar.clientSlug);
    }
  }, [calendar, client, isReady, setClient]);

  if (!isReady || isLoading) {
    return (
      <main className="min-h-screen px-5 py-10 sm:px-8 sm:py-14 lg:px-10">
        <div className="mx-auto h-28 max-w-[1500px] animate-pulse rounded-3xl border border-[var(--border)] bg-[var(--card)]" />
      </main>
    );
  }

  if (error || !calendar) {
    return (
      <main className="min-h-screen px-5 py-10 sm:px-8 sm:py-14 lg:px-10">
        <div className="mx-auto max-w-[1500px] rounded-2xl border border-[#E4B9B9] bg-[#FFF0F0] px-5 py-4 text-sm text-[#8B3E3E]">
          {error ?? "No Social Media Calendar is available yet."}
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="border-b border-[var(--border)] bg-[var(--card)] px-5 py-3 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
            Calendar workspace
          </p>
          <p className="text-xs font-semibold text-[var(--foreground)]">
            {calendar.clientName}
          </p>
        </div>
      </div>
      <SocialContentCalendarWorkspace
        key={calendar.id}
        taskId={calendar.id}
        calendarHref={TEAM_GUEST_DEFAULT_PATH}
      />
    </>
  );
}
