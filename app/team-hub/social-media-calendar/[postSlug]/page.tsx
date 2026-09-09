import { notFound, redirect } from "next/navigation";
import { SocialContentCalendarWorkspace } from "@/app/team-hub/projects/[taskId]/calendar/workspace";
import { AssistantBubble } from "@/app/team-hub/projects/_components/AssistantBubble";
import { ProjectThemeProvider } from "@/app/team-hub/projects/_components/ProjectThemeProvider";
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

  let post: SocialPostRow | null = null;
  if (postId) {
    const { data } = await supabase
      .from("tasks")
      .select("id, title, division_task_id")
      .eq("id", postId)
      .maybeSingle();
    post = data as SocialPostRow | null;
  } else {
    const { data } = await supabase
      .from("tasks")
      .select("id, title, division_task_id")
      .not("division_task_id", "is", null)
      .limit(1000);
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
