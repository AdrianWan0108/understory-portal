import { SocialContentCalendarWorkspace } from "./workspace";

export default async function SocialContentCalendarPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  return <SocialContentCalendarWorkspace taskId={taskId} />;
}
