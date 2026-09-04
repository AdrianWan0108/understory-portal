import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default async function LegacyInternalApprovalPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const { data: legacyTask } = await supabase
    .from("division_tasks")
    .select("client_id")
    .eq("id", taskId)
    .eq("division", "social-media")
    .maybeSingle();

  if (legacyTask?.client_id) {
    const { data: calendar } = await supabase
      .from("division_tasks")
      .select("id")
      .eq("client_id", legacyTask.client_id)
      .eq("division", "social-media")
      .eq("template_type", "content_calendar")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (calendar) {
      redirect(`/team-hub/projects/${encodeURIComponent(calendar.id)}/calendar`);
    }
  }

  redirect("/team-hub/projects?division=social-media");
}
