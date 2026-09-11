import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SocialContentCalendarWorkspace } from "@/app/team-hub/projects/[taskId]/calendar/workspace";
import { AssistantBubble } from "@/app/team-hub/projects/_components/AssistantBubble";
import { ProjectThemeProvider } from "@/app/team-hub/projects/_components/ProjectThemeProvider";
import {
  getTeamIdentityForUsername,
  TEAM_GUEST_CLIENT_SLUG,
  TEAM_IDENTITIES,
  TEAM_SESSION_COOKIE,
} from "@/lib/team-auth";
import {
  socialPostHref,
  socialPostIdFromPathSegment,
  socialPostPathSegment,
  socialPostTitleSlug,
} from "@/lib/social-post-links";
import { supabase } from "@/lib/supabase";

type SocialPostRow = {
  id: string;
  title: string;
  division_task_id: string | null;
};

export default async function SocialPostPage({
  params,
}: {
  params: Promise<{ postSlug: string }>;
}) {
  const { postSlug } = await params;
  const postId = socialPostIdFromPathSegment(postSlug);
  const identity = getTeamIdentityForUsername(
    (await cookies()).get(TEAM_SESSION_COOKIE)?.value,
  );
  const isGuest =
    identity !== null && TEAM_IDENTITIES[identity].accessLevel === "guest";
  let allowedCalendarId: string | null = null;

  if (isGuest) {
    const { data: guestClient } = await supabase
      .from("clients")
      .select("id")
      .eq("slug", TEAM_GUEST_CLIENT_SLUG)
      .maybeSingle();

    if (!guestClient) notFound();

    const { data: guestCalendar } = await supabase
      .from("division_tasks")
      .select("id")
      .eq("client_id", guestClient.id)
      .eq("division", "social-media")
      .eq("template_type", "content_calendar")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!guestCalendar) notFound();
    allowedCalendarId = guestCalendar.id;
  }

  let post: SocialPostRow | null = null;
  if (postId) {
    let postQuery = supabase
      .from("tasks")
      .select("id, title, division_task_id")
      .eq("id", postId);
    if (allowedCalendarId) {
      postQuery = postQuery.eq("division_task_id", allowedCalendarId);
    }
    const { data } = await postQuery.maybeSingle();
    post = data as SocialPostRow | null;
  } else {
    let postQuery = supabase
      .from("tasks")
      .select("id, title, division_task_id")
      .limit(1000);
    postQuery = allowedCalendarId
      ? postQuery.eq("division_task_id", allowedCalendarId)
      : postQuery.not("division_task_id", "is", null);
    const { data } = await postQuery;
    post =
      ((data ?? []) as SocialPostRow[]).find(
        (candidate) => socialPostTitleSlug(candidate.title) === postSlug,
      ) ?? null;
  }

  if (!post?.division_task_id) notFound();
  if (postSlug !== socialPostPathSegment(post)) {
    redirect(socialPostHref(post));
  }

  return (
    <ProjectThemeProvider initialTaskId={post.division_task_id}>
      <SocialContentCalendarWorkspace
        taskId={post.division_task_id}
        initialPostId={post.id}
      />
      <AssistantBubble />
    </ProjectThemeProvider>
  );
}
