"use client";

import { useEffect, useMemo, useState } from "react";
import { ClientSelect } from "@/app/_components/ClientSelect";
import { SocialContentCalendarWorkspace } from "@/app/team-hub/projects/[taskId]/calendar/workspace";
import { useProjectTheme } from "@/app/team-hub/projects/_components/ProjectThemeProvider";
import { TEAM_GUEST_DEFAULT_PATH } from "@/lib/team-auth";
import { supabase } from "@/lib/supabase";

type CalendarClient = {
  name: string;
  slug: string;
};

type CalendarRow = {
  id: string;
  client_id: string;
  clients: CalendarClient | CalendarClient[] | null;
};

type SocialCalendar = {
  id: string;
  clientId: string;
  clientName: string;
  clientSlug: string;
};

function calendarClient(row: CalendarRow) {
  return Array.isArray(row.clients) ? row.clients[0] : row.clients;
}

export function GuestSocialMediaCalendar() {
  const { client, isReady, setClient } = useProjectTheme();
  const [calendars, setCalendars] = useState<SocialCalendar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadCalendars() {
      setIsLoading(true);
      setError(null);

      const { data, error: calendarError } = await supabase
        .from("division_tasks")
        .select("id, client_id, clients(name, slug)")
        .eq("division", "social-media")
        .eq("template_type", "content_calendar");

      if (!isActive) return;
      if (calendarError) {
        setError(`Could not load Social Media Calendar: ${calendarError.message}`);
        setIsLoading(false);
        return;
      }

      const nextCalendars = ((data ?? []) as CalendarRow[])
        .map((row) => {
          const relatedClient = calendarClient(row);
          if (!relatedClient?.slug) return null;
          return {
            id: row.id,
            clientId: row.client_id,
            clientName: relatedClient.name,
            clientSlug: relatedClient.slug,
          };
        })
        .filter((calendar): calendar is SocialCalendar => Boolean(calendar))
        .sort((left, right) =>
          left.clientName.localeCompare(right.clientName, "en-CA"),
        );

      setCalendars(nextCalendars);
      setIsLoading(false);
    }

    void loadCalendars();
    return () => {
      isActive = false;
    };
  }, []);

  const selectedCalendar = useMemo(
    () =>
      calendars.find((calendar) => calendar.clientSlug === client) ??
      calendars[0] ??
      null,
    [calendars, client],
  );

  useEffect(() => {
    if (
      isReady &&
      selectedCalendar &&
      selectedCalendar.clientSlug !== client
    ) {
      setClient(selectedCalendar.clientSlug);
    }
  }, [client, isReady, selectedCalendar, setClient]);

  function selectCalendar(clientSlug: string) {
    setClient(clientSlug);
    const url = new URL(window.location.href);
    url.pathname = TEAM_GUEST_DEFAULT_PATH;
    url.search = "";
    url.searchParams.set("client", clientSlug);
    window.history.replaceState({}, "", url);
  }

  if (!isReady || isLoading) {
    return (
      <main className="min-h-screen px-5 py-10 sm:px-8 sm:py-14 lg:px-10">
        <div className="mx-auto h-28 max-w-[1500px] animate-pulse rounded-3xl border border-[var(--border)] bg-[var(--card)]" />
      </main>
    );
  }

  if (error || !selectedCalendar) {
    return (
      <main className="min-h-screen px-5 py-10 sm:px-8 sm:py-14 lg:px-10">
        <div className="mx-auto max-w-[1500px] rounded-2xl border border-[#E4B9B9] bg-[#FFF0F0] px-5 py-4 text-sm text-[#8B3E3E]">
          {error ?? "No Social Media Calendar is available yet."}
        </div>
      </main>
    );
  }

  const calendarHref = `${TEAM_GUEST_DEFAULT_PATH}?client=${encodeURIComponent(
    selectedCalendar.clientSlug,
  )}`;

  return (
    <>
      <div className="border-b border-[var(--border)] bg-[var(--card)] px-5 py-3 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
            Calendar workspace
          </p>
          <ClientSelect
            value={selectedCalendar.clientSlug}
            onChange={selectCalendar}
            options={calendars.map((calendar) => ({
              value: calendar.clientSlug,
              label: calendar.clientName,
            }))}
            ariaLabel="Select social media calendar client"
            tone="themed"
          />
        </div>
      </div>
      <SocialContentCalendarWorkspace
        key={selectedCalendar.id}
        taskId={selectedCalendar.id}
        calendarHref={calendarHref}
      />
    </>
  );
}
