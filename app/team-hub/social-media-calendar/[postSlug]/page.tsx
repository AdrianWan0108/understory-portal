import { notFound, redirect } from "next/navigation";
import { SocialContentCalendarWorkspace } from "@/app/team-hub/projects/[taskId]/calendar/workspace";
import { AssistantBubble } from "@/app/team-hub/projects/_components/AssistantBubble";
import { ProjectThemeProvider } from "@/app/team-hub/projects/_components/ProjectThemeProvider";
import {
  socialPostHref,
  socialPostIdFromPathSegment,
  socialPostPathSegment,
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

  if (!postId) notFound();

  const { data } = await supabase
    .from("tasks")
    .select("id, title, division_task_id")
    .eq("id", postId)
    .maybeSingle();
  const post = data as SocialPostRow | null;

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
