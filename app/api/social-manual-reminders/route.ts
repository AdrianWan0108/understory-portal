import type { NextRequest } from "next/server";
import {
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
  getTeamIdentityForUsername,
} from "@/lib/team-auth";
import { sendSlackMessage, type SlackWebhookTarget } from "@/lib/slack";
import {
  buildManualPostReminderMessage,
  isManualPostReminderDue,
} from "@/lib/social-manual-reminders";
import { normalizeReelDetails } from "@/lib/social-content";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

type DueTask = {
  id: string;
  client_id: string;
  division_task_id: string | null;
  title: string;
  format: string | null;
  platform: string | null;
  purpose: string | null;
  brief: string | null;
  visual_note: string | null;
  post_caption: string | null;
  creative_drive_link: string | null;
  reel_details: unknown;
  scheduled_at: string;
  scheduling_mode: unknown;
  publishing_status: unknown;
  posted_at: string | null;
  manual_reminder_sent_at: string | null;
  assignee_usernames: string[] | null;
  assigned_to: string | null;
  task_slides: Array<{
    slide_number: number;
    on_screen_text: string | null;
    visual_note: string | null;
    slide_caption: string | null;
    image_url: string | null;
    slide_references: Array<{
      platform: string | null;
      url: string;
    }> | null;
  }> | null;
};

type ClientRow = { id: string; name: string; slug: string };
type ProfileRow = {
  team_username: string | null;
  full_name: string | null;
  slack_user_id: string | null;
};

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function reminderTarget(clientSlug: string): SlackWebhookTarget {
  if (clientSlug === "mvp" || clientSlug === "boardwalk") return clientSlug;
  return "admin";
}

async function sendDueManualPostReminders(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return jsonError("Supabase server configuration is unavailable.", 503);
  }

  const now = new Date();
  const { data, error } = await supabaseAdmin
    .from("tasks")
    .select(
      `
        id,
        client_id,
        division_task_id,
        title,
        format,
        platform,
        purpose,
        brief,
        visual_note,
        post_caption,
        creative_drive_link,
        reel_details,
        scheduled_at,
        scheduling_mode,
        publishing_status,
        posted_at,
        manual_reminder_sent_at,
        assignee_usernames,
        assigned_to,
        task_slides (
          slide_number,
          on_screen_text,
          visual_note,
          slide_caption,
          image_url,
          slide_references (
            platform,
            url
          )
        )
      `,
    )
    .eq("scheduling_mode", "manual")
    .eq("publishing_status", "scheduled")
    .is("posted_at", null)
    .is("manual_reminder_sent_at", null)
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", now.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("Could not load manual social reminders", error);
    return jsonError("Could not load manual social reminders.", 502);
  }

  const dueTasks = ((data ?? []) as unknown as DueTask[]).filter((task) =>
    isManualPostReminderDue({
      schedulingMode: task.scheduling_mode,
      publishingStatus: task.publishing_status,
      scheduledAt: task.scheduled_at,
      postedAt: task.posted_at,
      reminderSentAt: task.manual_reminder_sent_at,
      now,
    }),
  );
  if (!dueTasks.length) {
    return Response.json({ ok: true, checked: 0, sent: 0, failed: 0 });
  }

  const clientIds = [...new Set(dueTasks.map((task) => task.client_id))];
  const usernames = [
    ...new Set(dueTasks.flatMap((task) => task.assignee_usernames ?? [])),
  ];
  const [{ data: clientData }, { data: profileData }] = await Promise.all([
    supabaseAdmin.from("clients").select("id, name, slug").in("id", clientIds),
    usernames.length
      ? supabaseAdmin
          .from("profiles")
          .select("team_username, full_name, slack_user_id")
          .in("team_username", usernames)
      : Promise.resolve({ data: [] }),
  ]);
  const clients = new Map(
    ((clientData ?? []) as ClientRow[]).map((client) => [client.id, client]),
  );
  const profiles = new Map(
    ((profileData ?? []) as ProfileRow[]).flatMap((profile) =>
      profile.team_username ? [[profile.team_username, profile] as const] : [],
    ),
  );

  let sent = 0;
  let failed = 0;
  let duplicates = 0;

  for (const task of dueTasks) {
    const transitionKey = `${task.id}:manual_post_due:${task.scheduled_at}`;
    const { error: claimError } = await supabaseAdmin
      .from("social_notification_events")
      .insert({
        transition_key: transitionKey,
        task_id: task.id,
        event_type: "manual_post_due",
      });
    if (claimError?.code === "23505") {
      duplicates += 1;
      await supabaseAdmin
        .from("tasks")
        .update({ manual_reminder_sent_at: now.toISOString() })
        .eq("id", task.id);
      continue;
    }
    if (claimError) {
      failed += 1;
      console.error("Could not claim manual social reminder", claimError);
      continue;
    }

    const client = clients.get(task.client_id);
    const assigneeProfiles = (task.assignee_usernames ?? [])
      .map((username) => profiles.get(username))
      .filter((profile): profile is ProfileRow => Boolean(profile));
    const reel = normalizeReelDetails(task.reel_details);
    const calendarId = task.division_task_id;
    const directLink = calendarId
      ? `${request.nextUrl.origin}/team-hub/projects/${encodeURIComponent(calendarId)}/calendar?post=${encodeURIComponent(task.id)}`
      : `${request.nextUrl.origin}/team-hub/projects`;
    const message = buildManualPostReminderMessage({
      clientName: client?.name ?? "Client",
      title: task.title,
      format: task.format,
      platform: task.platform,
      scheduledAt: task.scheduled_at,
      assigneeMentions: assigneeProfiles
        .filter((profile) => profile.slack_user_id)
        .map((profile) => `<@${profile.slack_user_id}>`),
      assigneeNames:
        assigneeProfiles.map(
          (profile) => profile.full_name ?? profile.team_username ?? "Team member",
        ).length > 0
          ? assigneeProfiles.map(
              (profile) =>
                profile.full_name ?? profile.team_username ?? "Team member",
            )
          : task.assigned_to
            ? [task.assigned_to]
            : [],
      purpose: task.purpose,
      brief: task.brief,
      visualNote: task.visual_note,
      postCaption: task.format === "carousel" ? null : task.post_caption,
      creativeDriveLink: task.creative_drive_link,
      reel:
        task.format === "reel"
          ? {
              hook: reel.hook,
              script: reel.script,
              cta: reel.cta,
              videoUrl: reel.videoUrl,
            }
          : null,
      slides: (task.task_slides ?? [])
        .sort((a, b) => a.slide_number - b.slide_number)
        .map((slide) => ({
          slideNumber: slide.slide_number,
          onScreenText: slide.on_screen_text,
          visualNote: slide.visual_note,
          caption: slide.slide_caption,
          imageUrl: slide.image_url,
          references: slide.slide_references ?? [],
        })),
      directLink,
    });

    try {
      await sendSlackMessage(reminderTarget(client?.slug ?? ""), message);
      const sentAt = new Date().toISOString();
      const { error: updateError } = await supabaseAdmin
        .from("tasks")
        .update({ manual_reminder_sent_at: sentAt })
        .eq("id", task.id);
      if (updateError) {
        console.error("Manual reminder sent but timestamp update failed", updateError);
      }
      sent += 1;
    } catch (sendError) {
      failed += 1;
      console.error("Could not send manual social reminder", sendError);
      await supabaseAdmin
        .from("social_notification_events")
        .delete()
        .eq("transition_key", transitionKey);
    }
  }

  return Response.json({
    ok: failed === 0,
    checked: dueTasks.length,
    sent,
    failed,
    duplicates,
  });
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return jsonError("Unauthorized", 401);
  }
  return sendDueManualPostReminders(request);
}

export async function POST(request: NextRequest) {
  const identity = getTeamIdentityForUsername(
    request.cookies.get(TEAM_SESSION_COOKIE)?.value,
  );
  if (!identity || TEAM_IDENTITIES[identity].accessLevel !== "owner") {
    return jsonError("Owner access is required.", 403);
  }
  return sendDueManualPostReminders(request);
}
